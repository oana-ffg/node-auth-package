import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// Lazy imports for serverless optimization
let speakeasy: any = null;
let qrcode: any = null;

async function getSpeakeasy() {
  if (!speakeasy) {
    speakeasy = await import('speakeasy');
  }
  return speakeasy;
}

async function getQRCode() {
  if (!qrcode) {
    qrcode = await import('qrcode');
  }
  return qrcode;
}

// Fallback synchronous imports for backwards compatibility
import speakeasySync from 'speakeasy';
import qrcodeSync from 'qrcode';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import {
  registerSchema,
  loginSchema,
  login2FASchema,
  refreshSchema,
  confirm2FASchema,
  reset2FASchema,
  disable2FASchema,
  generate2FASchema,
  deleteAccountSchema
} from '../schemas/authSchemas';
import {
  encrypt2FASecret,
  decrypt2FASecret,
  serializeEncryptedData,
  deserializeEncryptedData
} from '../utils/encryption';
import { AuthConfig } from '../types';

export interface AuthControllerConfig extends AuthConfig {
  prisma: PrismaClient;
}

export class AuthController {
  private prisma: PrismaClient;
  private config: AuthConfig;

  constructor(config: AuthControllerConfig) {
    this.prisma = config.prisma;
    this.config = config;
  }

  /**
   * Registers a new user by creating a user record in the database.
   * Route: POST /register
   */
  public registerUser = async (req: Request, res: Response) => {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }
    const { email, password } = parse.data;

    try {
      // Check if a user with the given email already exists in the database
      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        // If user exists, respond with a conflict error
        return res.status(409).json({ error: 'User already exists.' });
      }

      // Hash the password using bcrypt with configured salt rounds for security
      const hashedPassword = await bcrypt.hash(password, this.config.security.bcryptRounds);

      // Create a new user record in the database with the hashed password
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
        },
      });

      // Respond with success message and user details (excluding password)
      return res.status(201).json({
        message: 'User registered successfully.',
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      // Log any errors and respond with internal server error
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  };

  /**
   * Authenticates a user by validating credentials and issuing a JWT token.
   * If 2FA is enabled, returns a temporary token that requires 2FA completion.
   * Route: POST /login
   */
  public loginUser = async (req: Request, res: Response) => {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }
    const { email, password } = parse.data;

    try {
      // Find the user in the database by email
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        // If user not found, respond with unauthorized error
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      // Compare the provided password with the stored hashed password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        // If password does not match, respond with unauthorized error
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      // Check if 2FA is enabled for this user
      if (user.twoFactorEnabled) {
        // Generate a temporary token for 2FA verification
        const tempToken = jwt.sign(
          {
            userId: user.id,
            temp: true,
            purpose: '2fa_verification'
          },
          this.config.jwt.secret,
          { expiresIn: '5m' }
        );

        return res.status(200).json({
          message: '2FA verification required',
          requires2FA: true,
          tempToken,
          user: {
            id: user.id,
            email: user.email,
          },
        });
      }

      // If 2FA is not enabled, proceed with normal login
      return await this.completeLogin(user, res);
    } catch (err) {
      // Log any errors and respond with internal server error
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  };

  /**
   * Completes login with 2FA verification using the temporary token from the loginUser function
   * Route: POST /login/2fa
   */
  public loginWith2FA = async (req: Request, res: Response) => {
    const parse = login2FASchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }
    const { otp, tempToken } = parse.data;

    try {
      // Verify the temporary token
      let decoded;
      try {
        decoded = jwt.verify(tempToken, this.config.jwt.secret) as any;
      } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired temporary token.' });
      }

      // Check if this is a valid temporary token for 2FA verification
      if (!decoded.temp || decoded.purpose !== '2fa_verification') {
        return res.status(401).json({ error: 'Invalid token type.' });
      }

      // Find the user
      const user = await this.prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Check if 2FA is enabled
      if (!user.twoFactorEnabled || !user.twoFactorSecret || !user.encryptionVersion) {
        return res.status(400).json({ error: '2FA is not enabled for this account.' });
      }

      // Decrypt the 2FA secret
      let decryptedSecret: string;
      try {
        const encryptedData = deserializeEncryptedData(user.twoFactorSecret);
        decryptedSecret = decrypt2FASecret(encryptedData, user.encryptionVersion);
      } catch (error) {
        console.error('Failed to decrypt 2FA secret during login:', error);
        return res.status(500).json({ error: 'Authentication system error.' });
      }

      // Verify the OTP code
      const speakeasyLib = speakeasy || speakeasySync;
      const verified = speakeasyLib.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token: otp,
        window: 2, // Allow for time drift (2 time steps = 60 seconds)
      });

      if (!verified) {
        return res.status(401).json({ error: 'Invalid 2FA code.' });
      }

      // Complete the login process
      return await this.completeLogin(user, res);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  };

  /**
   * Helper function to complete the login process by generating tokens.
   */
  private completeLogin = async (user: any, res: Response) => {
    // Create a JWT token containing the user's ID, signed with the secret key
    const token = jwt.sign(
      { userId: user.id },
      this.config.jwt.secret,
      { expiresIn: this.config.jwt.expiresIn } as jwt.SignOptions
    );

    // Generate and store refresh token in DB with configured expiration
    const refreshToken = crypto.randomUUID();
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setTime(refreshTokenExpiry.getTime() + this.parseDuration(this.config.jwt.refreshExpiresIn));

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: refreshTokenExpiry,
      },
    });

    // Respond with success message and access token
    return res.status(200).json({
      message: 'Login successful',
      accessToken: token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  };

  /**
   * Issues a new access token using a valid refresh token.
   * Route: POST /refresh
   */
  public refreshTokenHandler = async (req: Request, res: Response) => {
    const parse = refreshSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }

    const { refreshToken } = parse.data;

    try {
      const existingToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!existingToken) {
        return res.status(401).json({ error: 'Invalid refresh token.' });
      }

      if (existingToken.expiresAt < new Date()) {
        return res.status(403).json({ error: 'Refresh token has expired.' });
      }

      // Rotate the refresh token
      const newRefreshToken = crypto.randomUUID();
      const newExpiry = new Date();
      newExpiry.setTime(newExpiry.getTime() + this.parseDuration(this.config.jwt.refreshExpiresIn));

      await this.prisma.$transaction([
        this.prisma.refreshToken.delete({ where: { token: refreshToken } }),
        this.prisma.refreshToken.create({
          data: {
            token: newRefreshToken,
            userId: existingToken.userId,
            expiresAt: newExpiry,
          },
        }),
      ]);

      // Issue new access token
      const accessToken = jwt.sign(
        { userId: existingToken.userId },
        this.config.jwt.secret,
        { expiresIn: this.config.jwt.expiresIn } as jwt.SignOptions
      );

      return res.status(200).json({
        message: 'Token refreshed successfully',
        accessToken,
        refreshToken: newRefreshToken,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  };

  /**
   * Generates a 2FA secret and returns a QR code URL to scan with an authenticator app.
   * Route: POST /2fa/generate
   */
  public generate2FASecret = async (req: AuthenticatedRequest, res: Response) => {
    const parse = generate2FASchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }
    const { password } = parse.data;

    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Always require password verification for security
    if (!password) {
      return res.status(400).json({
        error: 'Password is required to manage 2FA settings.'
      });
    }

    // Verify the provided password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    // If 2FA is already enabled, return existing secret
    if (user.twoFactorEnabled && user.twoFactorSecret && user.encryptionVersion) {
      try {
        // Decrypt the existing secret
        const encryptedData = deserializeEncryptedData(user.twoFactorSecret);
        const decryptedSecret = decrypt2FASecret(encryptedData, user.encryptionVersion, this.config.encryption);

        const speakeasyLib = speakeasy || speakeasySync;
        const qrcodeLib = qrcode || qrcodeSync;

        const secret = {
          base32: decryptedSecret,
          otpauth_url: speakeasyLib.otpauthURL({
            secret: decryptedSecret,
            label: user.email,
            issuer: this.config.appName,
            algorithm: 'sha1',
            digits: 6,
            period: 30,
          })
        };

        const qr = await qrcodeLib.toDataURL(secret.otpauth_url);

        return res.json({
          otpauthUrl: secret.otpauth_url,
          qrCodeDataURL: qr,
          message: '2FA is already enabled. This is your existing setup.'
        });
      } catch (error) {
        console.error('Failed to decrypt existing 2FA secret:', error);
        return res.status(500).json({ error: 'Failed to retrieve existing 2FA setup.' });
      }
    }

    // Generate new secret only if 2FA is not enabled
    const speakeasyLib = speakeasy || speakeasySync;
    const qrcodeLib = qrcode || qrcodeSync;

    const secret = speakeasyLib.generateSecret({
      name: `${this.config.appName} (${user.email})`,
    });

    try {
      // Encrypt the secret with current version
      const { encryptedData, version } = encrypt2FASecret(secret.base32);
      const serializedData = serializeEncryptedData(encryptedData);

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: serializedData,
          encryptionVersion: version
        },
      });

      const otpauthUrl = secret.otpauth_url!;
      const qr = await qrcodeLib.toDataURL(otpauthUrl);

      return res.json({ otpauthUrl, qrCodeDataURL: qr });
    } catch (error) {
      console.error('Failed to encrypt 2FA secret:', error);
      return res.status(500).json({ error: 'Failed to generate 2FA secret.' });
    }
  };

  /**
   * Confirms a 2FA OTP code and enables 2FA for the user if valid.
   * Route: POST /2fa/confirm
   */
  public confirm2FA = async (req: AuthenticatedRequest, res: Response) => {
    const parse = confirm2FASchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }
    const { otp } = parse.data;

    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Find the user and verify they have a 2FA secret
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.twoFactorSecret || !user.encryptionVersion) {
        return res.status(400).json({ error: '2FA secret not found. Please generate a 2FA secret first.' });
      }

      // Decrypt the 2FA secret
      let decryptedSecret: string;
      try {
        const encryptedData = deserializeEncryptedData(user.twoFactorSecret);
        decryptedSecret = decrypt2FASecret(encryptedData, user.encryptionVersion);
      } catch (error) {
        console.error('Failed to decrypt 2FA secret during confirmation:', error);
        return res.status(500).json({ error: 'Authentication system error.' });
      }

      // Verify the OTP code using speakeasy
      const speakeasyLib = speakeasy || speakeasySync;
      const verified = speakeasyLib.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token: otp,
        window: 2, // Allow for time drift (2 time steps = 60 seconds)
      });

      if (!verified) {
        return res.status(400).json({ error: 'Invalid OTP code. Please try again.' });
      }

      // Enable 2FA for the user
      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      });

      return res.status(200).json({
        message: '2FA enabled successfully',
        twoFactorEnabled: true,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  };

  /**
   * Resets 2FA by generating a new secret. Requires password verification for security.
   * Route: POST /2fa/reset
   */
  public reset2FA = async (req: AuthenticatedRequest, res: Response) => {
    const parse = reset2FASchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }
    const { password } = parse.data;

    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Find the user and verify password
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify the provided password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid password.' });
      }

      // Generate new secret
      const speakeasyLib = speakeasy || speakeasySync;
      const qrcodeLib = qrcode || qrcodeSync;

      const secret = speakeasyLib.generateSecret({
        name: `${this.config.appName} (${user.email})`,
      });

      try {
        // Encrypt the new secret with current version
        const { encryptedData, version } = encrypt2FASecret(secret.base32);
        const serializedData = serializeEncryptedData(encryptedData);

        // Update user with new secret and disable 2FA until confirmed
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorSecret: serializedData,
            encryptionVersion: version,
            twoFactorEnabled: false // Disable until new setup is confirmed
          },
        });

        const otpauthUrl = secret.otpauth_url!;
        const qr = await qrcodeLib.toDataURL(otpauthUrl);

        return res.status(200).json({
          message: '2FA reset successfully. Please scan the new QR code and confirm setup.',
          otpauthUrl,
          qrCodeDataURL: qr,
        });
      } catch (error) {
        console.error('Failed to encrypt new 2FA secret during reset:', error);
        return res.status(500).json({ error: 'Failed to reset 2FA secret.' });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  };

  /**
   * Disables 2FA for the user. Requires password verification for security.
   * Route: POST /2fa/disable
   */
  public disable2FA = async (req: AuthenticatedRequest, res: Response) => {
    const parse = disable2FASchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }
    const { password } = parse.data;

    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Find the user and verify password
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if 2FA is enabled
      if (!user.twoFactorEnabled) {
        return res.status(400).json({ error: '2FA is not enabled for this account.' });
      }

      // Verify the provided password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid password.' });
      }

      // Disable 2FA and clear the secret
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          encryptionVersion: null
        },
      });

      return res.status(200).json({
        message: '2FA disabled successfully.',
        twoFactorEnabled: false,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  };

  /**
   * Deletes the user account and all associated data. Requires password verification for security.
   * Route: DELETE /account
   */
  public deleteAccount = async (req: AuthenticatedRequest, res: Response) => {
    const parse = deleteAccountSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: z.flattenError(parse.error) });
    }
    const { password } = parse.data;

    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Find the user and verify password
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify the provided password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid password.' });
      }

      // Delete all associated data in a transaction to ensure data consistency
      await this.prisma.$transaction(async (tx: any) => {
        // Verify the user still exists before deletion
        const currentUser = await tx.user.findUnique({
          where: { id: userId }
        });

        if (!currentUser) {
          throw new Error('User no longer exists');
        }

        // Delete the user account (cascading deletes will handle refresh tokens and backup codes)
        await tx.user.delete({
          where: { id: userId },
        });
      });

      return res.status(200).json({
        message: 'Account deleted successfully. All data has been permanently removed.',
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error.' });
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