import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

// Define DeviceType enum since it's not exported by @prisma/client in package context
enum DeviceType {
  unknown = 'unknown',
  single_device = 'single_device',
  cross_platform = 'cross_platform'
}
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Dynamic imports for serverless optimization
let webauthnServer: any = null;
let webauthnTypes: any = null;

async function getWebAuthnServer() {
  if (!webauthnServer) {
    webauthnServer = await import('@simplewebauthn/server');
  }
  return webauthnServer;
}

async function getWebAuthnTypes() {
  if (!webauthnTypes) {
    webauthnTypes = await import('@simplewebauthn/types');
  }
  return webauthnTypes;
}

// Fallback synchronous imports for backwards compatibility
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';

import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

import {
  passkeyRegistrationStartSchema,
  passkeyRegistrationCompleteSchema,
  passkeyAuthenticationStartSchema,
  passkeyAuthenticationCompleteSchema,
  passkeyDeleteSchema,
  passkeyRenameSchema,
} from '../schemas/authSchemas';

import { AuthConfig } from '../types';
import { ErrorHandler, AppError } from '../utils/errorHandler';

export interface PasskeyControllerConfig extends AuthConfig {
  prisma: PrismaClient;
}

export class PasskeyController {
  private prisma: PrismaClient;
  private config: AuthConfig;

  constructor(config: PasskeyControllerConfig) {
    this.prisma = config.prisma;
    this.config = config;
  }

  // Helper function to create challenge expiration date
  private getChallengeExpiration(): Date {
    const expiration = new Date();
    expiration.setTime(expiration.getTime() + this.config.webauthn.timeout + 30000); // Timeout + 30s grace period
    return expiration;
  }

  /**
   * Starts passkey registration process by generating challenge options
   * Route: POST /passkey/register/start
   */
  public startPasskeyRegistration = async (req: AuthenticatedRequest, res: Response) => {
    const parse = passkeyRegistrationStartSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }

    const { password } = parse.data;
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { passkeys: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify the provided password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid password.' });
      }

      // Get existing passkeys for excludeCredentials
      const existingPasskeys = user.passkeys.map((passkey: any) => ({
        id: passkey.credentialId,
        type: 'public-key' as const,
        transports: passkey.transports as any[],
      }));

      const options: GenerateRegistrationOptionsOpts = {
        rpName: this.config.webauthn.rpName,
        rpID: this.config.webauthn.rpId,
        userID: Buffer.from(user.id),
        userName: user.email,
        userDisplayName: user.email,
        timeout: this.config.webauthn.timeout,
        attestationType: 'none',
        excludeCredentials: existingPasskeys,
        authenticatorSelection: {
          residentKey: 'preferred',
          requireResidentKey: false,
          userVerification: this.config.webauthn.userVerification,
        },
        supportedAlgorithmIDs: [-7, -257], // ES256, RS256
      };

      const registrationOptions = await generateRegistrationOptions(options);

      // Store challenge in database
      await this.prisma.challenge.create({
        data: {
          challenge: registrationOptions.challenge,
          userId: user.id,
          type: 'registration',
          expiresAt: this.getChallengeExpiration(),
        },
      });

      return res.json(registrationOptions);
    } catch (err) {
      return ErrorHandler.handleError(err, res, 'passkey registration start');
    }
  };

  /**
   * Completes passkey registration by verifying the credential
   * Route: POST /passkey/register/complete
   */
  public completePasskeyRegistration = async (req: AuthenticatedRequest, res: Response) => {
    const parse = passkeyRegistrationCompleteSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }

    const { credential, name } = parse.data;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Parse client data to get challenge
      let clientDataJSON: any;
      try {
        const clientDataString = Buffer.from(credential.response.clientDataJSON, 'base64url').toString();
        clientDataJSON = JSON.parse(clientDataString);
      } catch (e) {
        return ErrorHandler.handleError(
          new AppError('Invalid client data format', 400, true, {
            reason: 'Failed to parse client data JSON from base64url encoding',
            help: 'Ensure the clientDataJSON field contains valid base64url-encoded JSON'
          }),
          res,
          'passkey registration - client data parsing'
        );
      }

      const expectedChallenge = clientDataJSON.challenge;
      if (!expectedChallenge) {
        return res.status(400).json({ error: 'No challenge found in client data' });
      }

      // Verify challenge exists in database and is valid
      const challengeRecord = await this.prisma.challenge.findUnique({
        where: { challenge: expectedChallenge },
      });

      if (!challengeRecord) {
        return res.status(400).json({ error: 'Challenge not found or expired' });
      }

      if (challengeRecord.expiresAt < new Date()) {
        // Clean up expired challenge
        await this.prisma.challenge.delete({ where: { id: challengeRecord.id } });
        return res.status(400).json({ error: 'Challenge has expired' });
      }

      if (challengeRecord.type !== 'registration' || challengeRecord.userId !== user.id) {
        return res.status(400).json({ error: 'Invalid challenge for this operation' });
      }

      const verification: VerifyRegistrationResponseOpts = {
        response: credential as RegistrationResponseJSON,
        expectedChallenge,
        expectedOrigin: this.config.webauthn.origin,
        expectedRPID: this.config.webauthn.rpId,
        requireUserVerification: this.config.webauthn.userVerification === 'required',
      };

      const verificationResponse = await verifyRegistrationResponse(verification);

      if (!verificationResponse.verified || !verificationResponse.registrationInfo) {
        return res.status(400).json({ error: 'Passkey registration verification failed' });
      }

      const registrationInfo = verificationResponse.registrationInfo!;
      const credentialPublicKey = registrationInfo.credential.publicKey;
      const counter = registrationInfo.credential.counter;
      const credentialDeviceType = registrationInfo.credentialDeviceType;
      const mappedDeviceType: DeviceType =
        credentialDeviceType === 'singleDevice'
          ? DeviceType.single_device
          : credentialDeviceType === 'multiDevice'
          ? DeviceType.cross_platform
          : DeviceType.unknown;
      const credentialBackedUp = registrationInfo.credentialBackedUp;

      // Check if credential already exists
      const existingPasskey = await this.prisma.passkey.findUnique({
        where: { credentialId: credential.id },
      });

      if (existingPasskey) {
        return res.status(409).json({ error: 'This passkey is already registered' });
      }

      // Save the passkey to database
      const credentialIdToStore = credential.id;

      const passkey = await this.prisma.passkey.create({
        data: {
          userId: user.id,
          credentialId: credentialIdToStore,
          publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
          counter: BigInt(counter),
          deviceType: mappedDeviceType,
          backedUp: credentialBackedUp,
          transports: credential.response.transports || [],
          name: name || `Passkey ${new Date().toLocaleDateString()}`,
        },
      });

      // Clean up used challenge
      await this.prisma.challenge.delete({ where: { id: challengeRecord.id } });

      return res.status(201).json({
        message: 'Passkey registered successfully',
        passkey: {
          id: passkey.id,
          name: passkey.name,
          createdAt: passkey.createdAt,
          deviceType: passkey.deviceType,
          backedUp: passkey.backedUp,
        },
      });
    } catch (err) {
      return ErrorHandler.handleError(err, res, 'passkey registration complete');
    }
  };

  /**
   * Starts passkey authentication process by generating challenge options
   * Route: POST /passkey/authenticate/start
   */
  public startPasskeyAuthentication = async (req: Request, res: Response) => {
    const parse = passkeyAuthenticationStartSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }

    const { email } = parse.data;

    try {
      let allowCredentials: { id: string; type: 'public-key'; transports?: any[] }[] = [];

      // If email is provided, get user's passkeys for allowCredentials
      if (email) {
        const user = await this.prisma.user.findUnique({
          where: { email },
          include: { passkeys: true },
        });

        if (user && user.passkeys.length > 0) {
          allowCredentials = user.passkeys.map((passkey: any) => ({
            id: passkey.credentialId,
            type: 'public-key' as const,
            transports: passkey.transports as any[],
          }));
        }
      }

      const options: GenerateAuthenticationOptionsOpts = {
        timeout: this.config.webauthn.timeout,
        allowCredentials: (email && allowCredentials.length > 0) ? allowCredentials : undefined,
        userVerification: this.config.webauthn.userVerification,
        rpID: this.config.webauthn.rpId,
      };

      const authenticationOptions = await generateAuthenticationOptions(options);

      // Store challenge in database
      await this.prisma.challenge.create({
        data: {
          challenge: authenticationOptions.challenge,
          email,
          type: 'authentication',
          expiresAt: this.getChallengeExpiration(),
        },
      });

      return res.json(authenticationOptions);
    } catch (err) {
      return ErrorHandler.handleError(err, res, 'passkey authentication start');
    }
  };

  /**
   * Completes passkey authentication by verifying the assertion
   * Route: POST /passkey/authenticate/complete
   */
  public completePasskeyAuthentication = async (req: Request, res: Response) => {
    const parse = passkeyAuthenticationCompleteSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }

    const { credential } = parse.data;

    try {
      // Parse client data to get challenge
      let clientDataJSON: any;
      try {
        const clientDataString = Buffer.from(credential.response.clientDataJSON, 'base64url').toString();
        clientDataJSON = JSON.parse(clientDataString);
      } catch (e) {
        return ErrorHandler.handleError(
          new AppError('Invalid authentication client data', 400, true, {
            reason: 'Failed to parse client data JSON from base64url encoding',
            help: 'Ensure the clientDataJSON field contains valid base64url-encoded JSON'
          }),
          res,
          'passkey authentication - client data parsing'
        );
      }

      const expectedChallenge = clientDataJSON.challenge;
      if (!expectedChallenge) {
        return res.status(400).json({ error: 'No challenge found in client data' });
      }

      // Verify challenge exists in database and is valid
      const challengeRecord = await this.prisma.challenge.findUnique({
        where: { challenge: expectedChallenge },
      });

      if (!challengeRecord) {
        return res.status(400).json({ error: 'Challenge not found or expired' });
      }

      if (challengeRecord.expiresAt < new Date()) {
        // Clean up expired challenge
        await this.prisma.challenge.delete({ where: { id: challengeRecord.id } });
        return res.status(400).json({ error: 'Challenge has expired' });
      }

      if (challengeRecord.type !== 'authentication') {
        return res.status(400).json({ error: 'Invalid challenge for this operation' });
      }

      // Find the passkey in the database
      const passkey = await this.prisma.passkey.findUnique({
        where: { credentialId: credential.id },
        include: { user: true },
      });

      if (!passkey) {
        return res.status(401).json({ error: 'Passkey not found' });
      }

      const verification = {
        response: credential as AuthenticationResponseJSON,
        expectedChallenge,
        expectedOrigin: this.config.webauthn.origin,
        expectedRPID: this.config.webauthn.rpId,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
          counter: Number(passkey.counter),
          transports: passkey.transports as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[],
        },
        requireUserVerification: this.config.webauthn.userVerification === 'required',
      };

      const verificationResponse = await verifyAuthenticationResponse(verification);

      if (!verificationResponse.verified) {
        return res.status(401).json({ error: 'Passkey authentication verification failed' });
      }

      // Update counter and last used
      await this.prisma.passkey.update({
        where: { id: passkey.id },
        data: {
          counter: BigInt(verificationResponse.authenticationInfo?.newCounter || 0),
          lastUsed: new Date(),
        },
      });

      // Clean up used challenge
      await this.prisma.challenge.delete({ where: { id: challengeRecord.id } });

      // Generate JWT tokens (similar to regular login)
      const accessToken = jwt.sign(
        { userId: passkey.user.id },
        this.config.jwt.secret,
        { expiresIn: this.config.jwt.expiresIn } as jwt.SignOptions
      );

      // Generate and store refresh token
      const refreshToken = crypto.randomUUID();
      const refreshTokenExpiry = new Date();
      refreshTokenExpiry.setTime(refreshTokenExpiry.getTime() + this.parseDuration(this.config.jwt.refreshExpiresIn));

      await this.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: passkey.user.id,
          expiresAt: refreshTokenExpiry,
        },
      });

      return res.status(200).json({
        message: 'Passkey authentication successful',
        accessToken,
        refreshToken,
        user: {
          id: passkey.user.id,
          email: passkey.user.email,
          twoFactorEnabled: passkey.user.twoFactorEnabled,
        },
      });
    } catch (err) {
      return ErrorHandler.handleError(err, res, 'passkey authentication complete');
    }
  };

  /**
   * Lists all passkeys for the authenticated user
   * Route: GET /passkey/list
   */
  public listPasskeys = async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const passkeys = await this.prisma.passkey.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          deviceType: true,
          backedUp: true,
          transports: true,
          createdAt: true,
          lastUsed: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ passkeys });
    } catch (err) {
      return ErrorHandler.handleError(err, res, 'list passkeys');
    }
  };

  /**
   * Deletes a passkey for the authenticated user
   * Route: DELETE /passkey/:id
   */
  public deletePasskey = async (req: AuthenticatedRequest, res: Response) => {
    const { id: passkeyId } = req.params;
    const parse = passkeyDeleteSchema.safeParse({ ...req.body, passkeyId });
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }

    const { password } = parse.data;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Verify user and password
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      // Find and delete the passkey
      const passkey = await this.prisma.passkey.findFirst({
        where: { id: passkeyId, userId },
      });

      if (!passkey) {
        return res.status(404).json({ error: 'Passkey not found' });
      }

      await this.prisma.passkey.delete({
        where: { id: passkeyId },
      });

      return res.json({ message: 'Passkey deleted successfully' });
    } catch (err) {
      return ErrorHandler.handleError(err, res, 'delete passkey');
    }
  };

  /**
   * Renames a passkey for the authenticated user
   * Route: PATCH /passkey/:id/rename
   */
  public renamePasskey = async (req: AuthenticatedRequest, res: Response) => {
    const { id: passkeyId } = req.params;
    const parse = passkeyRenameSchema.safeParse({ ...req.body, passkeyId });
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }

    const { name } = parse.data;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Find and update the passkey
      const passkey = await this.prisma.passkey.findFirst({
        where: { id: passkeyId, userId },
      });

      if (!passkey) {
        return res.status(404).json({ error: 'Passkey not found' });
      }

      const updatedPasskey = await this.prisma.passkey.update({
        where: { id: passkeyId },
        data: { name },
        select: {
          id: true,
          name: true,
          deviceType: true,
          backedUp: true,
          transports: true,
          createdAt: true,
          lastUsed: true,
        },
      });

      return res.json({
        message: 'Passkey renamed successfully',
        passkey: updatedPasskey,
      });
    } catch (err) {
      return ErrorHandler.handleError(err, res, 'rename passkey');
    }
  };

  /**
   * Helper function to parse duration strings into milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) throw new Error(`Invalid duration format: ${duration}`);

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: throw new Error(`Invalid duration unit: ${unit}`);
    }
  }
}