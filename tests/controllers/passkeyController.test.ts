/**
 * PasskeyController Unit Tests
 *
 * Comprehensive tests for all PasskeyController methods including:
 * - Passkey registration initiation and challenge generation
 * - Passkey registration completion and verification
 * - Passkey authentication initiation
 * - Passkey authentication completion
 * - Passkey listing for authenticated users
 * - Passkey deletion and management
 * - Passkey renaming functionality
 * - Error handling for invalid WebAuthn responses
 */

import { PasskeyController, PasskeyControllerConfig } from '../../src/controllers/passkeyController';
import { MockPrismaClient } from '../mocks/prisma.mock';
import { generateMockUser, generateMockPasskey, generateTestAuthConfig } from '../helpers/data.generators';
import { standardUser, userWith2FA } from '../fixtures/users.fixtures';
import {
  standardPasskey,
  multiplePasskeys,
  registrationResponse,
  authenticationResponse,
  invalidWebAuthnResponses,
  WebAuthnFixtureHelpers
} from '../fixtures/webauthn.fixtures';
import { testConfig } from '../setup';
import { Request, Response } from 'express';
import { MockRequest, MockResponse, createMockRequest, createMockResponse } from '../mocks/express.mock';
import { AuthenticatedRequest } from '../../src/middleware/authMiddleware';
import { setupWebAuthnMock, webauthnTestScenarios, webauthnMock } from '../mocks/webauthn.mock';

// Mock external dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('crypto');
jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));
jest.mock('@simplewebauthn/types');

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedCrypto = crypto as jest.Mocked<typeof crypto>;
const mockedGenerateRegistrationOptions = generateRegistrationOptions as jest.MockedFunction<typeof generateRegistrationOptions>;
const mockedGenerateAuthenticationOptions = generateAuthenticationOptions as jest.MockedFunction<typeof generateAuthenticationOptions>;
const mockedVerifyRegistrationResponse = verifyRegistrationResponse as jest.MockedFunction<typeof verifyRegistrationResponse>;
const mockedVerifyAuthenticationResponse = verifyAuthenticationResponse as jest.MockedFunction<typeof verifyAuthenticationResponse>;

describe('PasskeyController', () => {
  let passkeyController: PasskeyController;
  let mockPrisma: MockPrismaClient;
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let config: PasskeyControllerConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock instances
    mockPrisma = new MockPrismaClient();
    mockRequest = createMockRequest();
    mockResponse = createMockResponse();

    // Setup WebAuthn mock with default successful scenarios
    setupWebAuthnMock(webauthnTestScenarios.successfulRegistration);

    // Setup test configuration
    config = {
      ...testConfig,
      prisma: mockPrisma as any,
    };

    // Initialize controller
    passkeyController = new PasskeyController(config);

    // Setup default mock implementations
    mockedBcrypt.compare.mockResolvedValue(true);
    mockedJwt.sign.mockReturnValue('mock_jwt_token');
    mockedCrypto.randomUUID.mockReturnValue('mock-refresh-token-uuid');

    // Setup WebAuthn mocks
    mockedGenerateRegistrationOptions.mockReturnValue({
      challenge: 'dGVzdC1jaGFsbGVuZ2U',
      rp: { name: 'Test App', id: 'localhost' },
      user: { id: 'test-user', name: 'test@example.com', displayName: 'Test User' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60000,
      attestation: 'none'
    } as any);

    mockedGenerateAuthenticationOptions.mockReturnValue({
      challenge: 'dGVzdC1hdXRoLWNoYWxsZW5nZQ',
      timeout: 60000,
      userVerification: 'preferred'
    } as any);

    mockedVerifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          publicKey: new Uint8Array([1, 2, 3, 4, 5]),
          counter: 0,
        },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false
      }
    } as any);

    mockedVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 1,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false
      }
    } as any);
  });

  describe('startPasskeyRegistration', () => {
    it('should generate registration options with valid password', async () => {
      const requestData = {
        password: 'testPassword123!',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const userWithPasskeys = {
        ...standardUser,
        passkeys: [standardPasskey],
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithPasskeys);

      // Override the mock for this specific test
      mockedGenerateRegistrationOptions.mockReturnValue({
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        rp: { name: config.webauthn.rpName, id: config.webauthn.rpId },
        user: { name: standardUser.email, displayName: standardUser.email },
      } as any);

      mockPrisma.challenge.create.mockResolvedValue({
        id: 'challenge_123',
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        userId: standardUser.id,
        type: 'registration',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      });

      await passkeyController.startPasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: standardUser.id },
        include: { passkeys: true },
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(requestData.password, userWithPasskeys.hashedPassword);
      expect(mockedGenerateRegistrationOptions).toHaveBeenCalled();
      expect(mockPrisma.challenge.create).toHaveBeenCalledWith({
        data: {
          challenge: expect.any(String),
          userId: standardUser.id,
          type: 'registration',
          expiresAt: expect.any(Date),
        },
      });
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        challenge: expect.any(String),
        rp: expect.objectContaining({
          name: config.webauthn.rpName,
          id: config.webauthn.rpId,
        }),
        user: expect.objectContaining({
          name: standardUser.email,
          displayName: standardUser.email,
        }),
      }));
    });

    it('should reject invalid password', async () => {
      const requestData = {
        password: 'wrongPassword',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const userWithoutPasskeys = { ...standardUser, passkeys: [] };
      mockPrisma.user.findUnique.mockResolvedValue(userWithoutPasskeys);
      mockedBcrypt.compare.mockResolvedValue(false);

      await passkeyController.startPasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockedBcrypt.compare).toHaveBeenCalledWith(requestData.password, userWithoutPasskeys.hashedPassword);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid password.'
      });
      expect(mockedGenerateRegistrationOptions).not.toHaveBeenCalled();
    });

    it('should handle user not found', async () => {
      const requestData = {
        password: 'testPassword123!',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: 'non-existent-user',
      } as AuthenticatedRequest;

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await passkeyController.startPasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'User not found'
      });
    });

    it('should handle unauthorized request', async () => {
      const requestData = {
        password: 'testPassword123!',
      };

      const unauthenticatedRequest = {
        ...mockRequest,
        body: requestData,
        // userId not set
      } as AuthenticatedRequest;

      await passkeyController.startPasskeyRegistration(unauthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized'
      });
    });

    it('should validate request schema', async () => {
      const invalidRequestData = {
        // Missing password field
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: invalidRequestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      await passkeyController.startPasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.any(Object) // Zod validation error
      });
    });

    it('should exclude existing credentials', async () => {
      const requestData = {
        password: 'testPassword123!',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const userWithMultiplePasskeys = {
        ...standardUser,
        passkeys: multiplePasskeys,
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithMultiplePasskeys);

      // Override the mock for this specific test with excludeCredentials
      const expectedExcludeCredentials = multiplePasskeys.map(passkey => ({
        id: passkey.credentialId,
        type: 'public-key',
        transports: passkey.transports || ['internal'],
      }));

      mockedGenerateRegistrationOptions.mockReturnValue({
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        rp: { name: config.webauthn.rpName, id: config.webauthn.rpId },
        user: { name: standardUser.email, displayName: standardUser.email },
        excludeCredentials: expectedExcludeCredentials,
      } as any);

      mockPrisma.challenge.create.mockResolvedValue({
        id: 'challenge_123',
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        userId: standardUser.id,
        type: 'registration',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      });

      await passkeyController.startPasskeyRegistration(authenticatedRequest, mockResponse as Response);

      const callArgs = mockedGenerateRegistrationOptions.mock.calls[0][0];
      expect(callArgs.excludeCredentials).toHaveLength(multiplePasskeys.length);
      expect(callArgs.excludeCredentials[0]).toEqual({
        id: multiplePasskeys[0].credentialId,
        type: 'public-key',
        transports: multiplePasskeys[0].transports,
      });
    });

    it('should handle database errors', async () => {
      const requestData = {
        password: 'testPassword123!',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      await passkeyController.startPasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });

  describe('completePasskeyRegistration', () => {
    it('should complete registration with valid credential', async () => {
      // Create a registration response with the correct challenge
      const correctClientDataJSON = Buffer.from(JSON.stringify({
        type: "webauthn.create",
        challenge: "dGVzdC1jaGFsbGVuZ2U",
        origin: "http://localhost:3000",
        crossOrigin: false
      })).toString('base64url');

      const correctedRegistrationResponse = {
        ...registrationResponse,
        response: {
          ...registrationResponse.response,
          clientDataJSON: correctClientDataJSON,
        },
      };

      const requestData = {
        credential: correctedRegistrationResponse,
        name: 'Test Device',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        userId: standardUser.id,
        type: 'registration',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      };

      const newPasskey = generateMockPasskey(standardUser.id, {
        name: 'Test Device',
        credentialId: correctedRegistrationResponse.id,
      });

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);
      mockPrisma.passkey.findUnique.mockResolvedValue(null); // No existing passkey
      mockPrisma.passkey.create.mockResolvedValue(newPasskey);
      mockPrisma.challenge.delete.mockResolvedValue(challengeRecord);

      // Override the mock for this specific test
      mockedVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false
        }
      } as any);

      await passkeyController.completePasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockPrisma.challenge.findUnique).toHaveBeenCalledWith({
        where: { challenge: 'dGVzdC1jaGFsbGVuZ2U' }
      });
      expect(mockedVerifyRegistrationResponse).toHaveBeenCalled();
      expect(mockPrisma.passkey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: standardUser.id,
          credentialId: registrationResponse.id,
          name: 'Test Device',
          deviceType: expect.any(String),
          backedUp: expect.any(Boolean),
        })
      });
      expect(mockPrisma.challenge.delete).toHaveBeenCalledWith({
        where: { id: challengeRecord.id }
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Passkey registered successfully',
        passkey: expect.objectContaining({
          id: newPasskey.id,
          name: 'Test Device',
          createdAt: newPasskey.createdAt,
        })
      });
    });

    it('should reject expired challenge', async () => {
      const requestData = {
        credential: registrationResponse,
        name: 'Test Device',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const expiredChallenge = {
        id: 'challenge_123',
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        userId: standardUser.id,
        type: 'registration',
        expiresAt: new Date(Date.now() - 60000), // Expired
        email: null,
        createdAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockPrisma.challenge.findUnique.mockResolvedValue(expiredChallenge);
      mockPrisma.challenge.delete.mockResolvedValue(expiredChallenge);

      await passkeyController.completePasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockPrisma.challenge.delete).toHaveBeenCalledWith({
        where: { id: expiredChallenge.id }
      });
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Challenge has expired'
      });
    });

    it('should reject challenge not found', async () => {
      const requestData = {
        credential: registrationResponse,
        name: 'Test Device',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockPrisma.challenge.findUnique.mockResolvedValue(null);

      await passkeyController.completePasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Challenge not found or expired'
      });
    });

    it('should reject verification failure', async () => {
      const requestData = {
        credential: registrationResponse,
        name: 'Test Device',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        userId: standardUser.id,
        type: 'registration',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);

      // Setup WebAuthn mock for failed verification
      setupWebAuthnMock(webauthnTestScenarios.failedRegistration);

      await passkeyController.completePasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Passkey registration verification failed'
      });
    });

    it('should reject duplicate credentials', async () => {
      const requestData = {
        credential: registrationResponse,
        name: 'Test Device',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        userId: standardUser.id,
        type: 'registration',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      };

      const existingPasskey = generateMockPasskey(standardUser.id, {
        credentialId: registrationResponse.id,
      });

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);
      mockPrisma.passkey.findUnique.mockResolvedValue(existingPasskey);

      // Setup WebAuthn mock for successful verification
      setupWebAuthnMock(webauthnTestScenarios.successfulRegistration);

      await passkeyController.completePasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'This passkey is already registered'
      });
    });

    it('should handle invalid client data JSON', async () => {
      const invalidCredential = {
        ...registrationResponse,
        response: {
          ...registrationResponse.response,
          clientDataJSON: 'invalid-base64-data',
        },
      };

      const requestData = {
        credential: invalidCredential,
        name: 'Test Device',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);

      await passkeyController.completePasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid client data format',
        details: expect.any(String),
      });
    });

    it('should validate request schema', async () => {
      const invalidRequestData = {
        // Missing credential field
        name: 'Test Device',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: invalidRequestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      await passkeyController.completePasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.any(Object) // Zod validation error
      });
    });
  });

  describe('startPasskeyAuthentication', () => {
    it('should generate authentication options with email', async () => {
      const requestData = {
        email: standardUser.email,
      };

      mockRequest.body = requestData;

      const userWithPasskeys = {
        ...standardUser,
        passkeys: multiplePasskeys,
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithPasskeys);
      mockPrisma.challenge.create.mockResolvedValue({
        id: 'challenge_123',
        challenge: 'mock_challenge',
        userId: null,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        email: standardUser.email,
        createdAt: new Date(),
      });

      await passkeyController.startPasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: standardUser.email },
        include: { passkeys: true },
      });
      expect(webauthnMock.generateAuthenticationOptions).toHaveBeenCalledWith({
        timeout: config.webauthn.timeout,
        allowCredentials: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            type: 'public-key',
          })
        ]),
        userVerification: config.webauthn.userVerification,
        rpID: config.webauthn.rpId,
      });
      expect(mockPrisma.challenge.create).toHaveBeenCalledWith({
        data: {
          challenge: expect.any(String),
          email: standardUser.email,
          type: 'authentication',
          expiresAt: expect.any(Date),
        },
      });
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        challenge: expect.any(String),
      }));
    });

    it('should generate authentication options without email', async () => {
      const requestData = {
        // No email provided
      };

      mockRequest.body = requestData;

      mockPrisma.challenge.create.mockResolvedValue({
        id: 'challenge_123',
        challenge: 'mock_challenge',
        userId: null,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      });

      await passkeyController.startPasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(webauthnMock.generateAuthenticationOptions).toHaveBeenCalledWith({
        timeout: config.webauthn.timeout,
        allowCredentials: undefined,
        userVerification: config.webauthn.userVerification,
        rpID: config.webauthn.rpId,
      });
      expect(mockPrisma.challenge.create).toHaveBeenCalledWith({
        data: {
          challenge: expect.any(String),
          email: undefined,
          type: 'authentication',
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should handle user not found for email', async () => {
      const requestData = {
        email: 'nonexistent@example.com',
      };

      mockRequest.body = requestData;

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.challenge.create.mockResolvedValue({
        id: 'challenge_123',
        challenge: 'mock_challenge',
        userId: null,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        email: requestData.email,
        createdAt: new Date(),
      });

      await passkeyController.startPasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(webauthnMock.generateAuthenticationOptions).toHaveBeenCalledWith({
        timeout: config.webauthn.timeout,
        allowCredentials: undefined,
        userVerification: config.webauthn.userVerification,
        rpID: config.webauthn.rpId,
      });
    });

    it('should validate request schema', async () => {
      const invalidRequestData = {
        email: 'invalid-email-format',
      };

      mockRequest.body = invalidRequestData;

      await passkeyController.startPasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.any(Object) // Zod validation error
      });
    });
  });

  describe('completePasskeyAuthentication', () => {
    it('should complete authentication with valid credential', async () => {
      const requestData = {
        credential: authenticationResponse,
      };

      mockRequest.body = requestData;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'YXV0aC1jaGFsbGVuZ2Utc3RyaW5nLWZvci10ZXN0aW5n',
        userId: null,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        email: standardUser.email,
        createdAt: new Date(),
      };

      const passkeyWithUser = {
        ...standardPasskey,
        user: standardUser,
      };

      const refreshToken = generateMockRefreshToken(standardUser.id);

      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);
      mockPrisma.passkey.findUnique.mockResolvedValue(passkeyWithUser);
      mockPrisma.passkey.update.mockResolvedValue(standardPasskey);
      mockPrisma.challenge.delete.mockResolvedValue(challengeRecord);
      mockPrisma.refreshToken.create.mockResolvedValue(refreshToken);

      // Setup WebAuthn mock for successful authentication
      setupWebAuthnMock(webauthnTestScenarios.successfulAuthentication);

      await passkeyController.completePasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(mockPrisma.challenge.findUnique).toHaveBeenCalledWith({
        where: { challenge: 'YXV0aC1jaGFsbGVuZ2Utc3RyaW5nLWZvci10ZXN0aW5n' }
      });
      expect(mockPrisma.passkey.findUnique).toHaveBeenCalledWith({
        where: { credentialId: authenticationResponse.id },
        include: { user: true },
      });
      expect(webauthnMock.verifyAuthenticationResponse).toHaveBeenCalled();
      expect(mockPrisma.passkey.update).toHaveBeenCalledWith({
        where: { id: standardPasskey.id },
        data: {
          counter: expect.any(BigInt),
          lastUsed: expect.any(Date),
        },
      });
      expect(mockPrisma.challenge.delete).toHaveBeenCalledWith({
        where: { id: challengeRecord.id }
      });
      expect(mockedJwt.sign).toHaveBeenCalledWith(
        { userId: standardUser.id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Passkey authentication successful',
        accessToken: 'mock_jwt_token',
        refreshToken: 'mock-refresh-token-uuid',
        user: {
          id: standardUser.id,
          email: standardUser.email,
          twoFactorEnabled: standardUser.twoFactorEnabled,
        },
      });
    });

    it('should reject passkey not found', async () => {
      const requestData = {
        credential: authenticationResponse,
      };

      mockRequest.body = requestData;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'YXV0aC1jaGFsbGVuZ2Utc3RyaW5nLWZvci10ZXN0aW5n',
        userId: null,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      };

      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);
      mockPrisma.passkey.findUnique.mockResolvedValue(null);

      await passkeyController.completePasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Passkey not found'
      });
    });

    it('should reject authentication verification failure', async () => {
      const requestData = {
        credential: authenticationResponse,
      };

      mockRequest.body = requestData;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'YXV0aC1jaGFsbGVuZ2Utc3RyaW5nLWZvci10ZXN0aW5n',
        userId: null,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      };

      const passkeyWithUser = {
        ...standardPasskey,
        user: standardUser,
      };

      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);
      mockPrisma.passkey.findUnique.mockResolvedValue(passkeyWithUser);

      // Setup WebAuthn mock for failed authentication
      setupWebAuthnMock(webauthnTestScenarios.failedAuthentication);

      await passkeyController.completePasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Passkey authentication verification failed'
      });
    });

    it('should handle invalid client data JSON', async () => {
      const invalidCredential = {
        ...authenticationResponse,
        response: {
          ...authenticationResponse.response,
          clientDataJSON: 'invalid-base64-data',
        },
      };

      const requestData = {
        credential: invalidCredential,
      };

      mockRequest.body = requestData;

      await passkeyController.completePasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid authentication client data',
        details: expect.any(String),
      });
    });
  });

  describe('listPasskeys', () => {
    it('should list user passkeys', async () => {
      const authenticatedRequest = {
        ...mockRequest,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const userPasskeys = multiplePasskeys.map(passkey => ({
        id: passkey.id,
        name: passkey.name,
        deviceType: 'single_device',
        backedUp: false,
        transports: ['internal'],
        createdAt: passkey.createdAt,
        lastUsed: null,
      }));

      mockPrisma.passkey.findMany.mockResolvedValue(userPasskeys);

      await passkeyController.listPasskeys(authenticatedRequest, mockResponse as Response);

      expect(mockPrisma.passkey.findMany).toHaveBeenCalledWith({
        where: { userId: standardUser.id },
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
      expect(mockResponse.json).toHaveBeenCalledWith({
        passkeys: userPasskeys
      });
    });

    it('should handle unauthorized request', async () => {
      const unauthenticatedRequest = {
        ...mockRequest,
        // userId not set
      } as AuthenticatedRequest;

      await passkeyController.listPasskeys(unauthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized'
      });
    });

    it('should return empty array when no passkeys', async () => {
      const authenticatedRequest = {
        ...mockRequest,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      mockPrisma.passkey.findMany.mockResolvedValue([]);

      await passkeyController.listPasskeys(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        passkeys: []
      });
    });
  });

  describe('deletePasskey', () => {
    it('should delete passkey with valid password', async () => {
      const requestData = {
        password: 'testPassword123!',
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: standardPasskey.id },
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockPrisma.passkey.findFirst.mockResolvedValue(standardPasskey);
      mockPrisma.passkey.delete.mockResolvedValue(standardPasskey);

      await passkeyController.deletePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: standardUser.id }
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(requestData.password, standardUser.hashedPassword);
      expect(mockPrisma.passkey.findFirst).toHaveBeenCalledWith({
        where: { id: standardPasskey.id, userId: standardUser.id },
      });
      expect(mockPrisma.passkey.delete).toHaveBeenCalledWith({
        where: { id: standardPasskey.id },
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Passkey deleted successfully'
      });
    });

    it('should reject invalid password', async () => {
      const requestData = {
        password: 'wrongPassword',
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: standardPasskey.id },
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockedBcrypt.compare.mockResolvedValue(false);

      await passkeyController.deletePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid password'
      });
    });

    it('should handle passkey not found', async () => {
      const requestData = {
        password: 'testPassword123!',
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: 'non-existent-passkey' },
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockPrisma.passkey.findFirst.mockResolvedValue(null);

      await passkeyController.deletePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Passkey not found'
      });
    });

    it('should validate request schema', async () => {
      const invalidRequestData = {
        // Missing password field
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: standardPasskey.id },
        body: invalidRequestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      await passkeyController.deletePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.any(Object) // Zod validation error
      });
    });
  });

  describe('renamePasskey', () => {
    it('should rename passkey successfully', async () => {
      const requestData = {
        name: 'New Device Name',
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: standardPasskey.id },
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      const updatedPasskey = {
        ...standardPasskey,
        name: 'New Device Name',
      };

      mockPrisma.passkey.findFirst.mockResolvedValue(standardPasskey);
      mockPrisma.passkey.update.mockResolvedValue(updatedPasskey);

      await passkeyController.renamePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockPrisma.passkey.findFirst).toHaveBeenCalledWith({
        where: { id: standardPasskey.id, userId: standardUser.id },
      });
      expect(mockPrisma.passkey.update).toHaveBeenCalledWith({
        where: { id: standardPasskey.id },
        data: { name: 'New Device Name' },
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
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Passkey renamed successfully',
        passkey: updatedPasskey,
      });
    });

    it('should handle passkey not found', async () => {
      const requestData = {
        name: 'New Device Name',
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: 'non-existent-passkey' },
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      mockPrisma.passkey.findFirst.mockResolvedValue(null);

      await passkeyController.renamePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Passkey not found'
      });
    });

    it('should validate request schema', async () => {
      const invalidRequestData = {
        // Missing name field
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: standardPasskey.id },
        body: invalidRequestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      await passkeyController.renamePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.any(Object) // Zod validation error
      });
    });

    it('should handle unauthorized request', async () => {
      const requestData = {
        name: 'New Device Name',
      };

      const unauthenticatedRequest = {
        ...mockRequest,
        params: { id: standardPasskey.id },
        body: requestData,
        // userId not set
      } as AuthenticatedRequest & { params: { id: string } };

      await passkeyController.renamePasskey(unauthenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized'
      });
    });
  });

  describe('Error handling', () => {
    it('should handle WebAuthn generation errors', async () => {
      const requestData = {
        password: 'testPassword123!',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      mockPrisma.user.findUnique.mockResolvedValue({ ...standardUser, passkeys: [] });

      // Setup WebAuthn mock to throw error
      setupWebAuthnMock({ registrationError: new Error('WebAuthn generation failed') });

      await passkeyController.startPasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        details: expect.stringContaining('WebAuthn generation failed')
      });
    });

    it('should handle WebAuthn verification errors', async () => {
      const requestData = {
        credential: registrationResponse,
        name: 'Test Device',
      };

      const authenticatedRequest = {
        ...mockRequest,
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        userId: standardUser.id,
        type: 'registration',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(standardUser);
      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);
      mockPrisma.passkey.findUnique.mockResolvedValue(null);

      // Setup WebAuthn mock to throw verification error
      setupWebAuthnMock({ verificationError: new Error('Verification failed') });

      await passkeyController.completePasskeyRegistration(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        details: expect.stringContaining('Verification failed')
      });
    });

    it('should handle duration parsing errors', async () => {
      const requestData = {
        credential: authenticationResponse,
      };

      mockRequest.body = requestData;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'YXV0aC1jaGFsbGVuZ2Utc3RyaW5nLWZvci10ZXN0aW5n',
        userId: null,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      };

      const passkeyWithUser = {
        ...standardPasskey,
        user: standardUser,
      };

      // Override config with invalid refresh token duration
      const invalidConfig = {
        ...config,
        jwt: {
          ...config.jwt,
          refreshExpiresIn: 'invalid-duration',
        },
      };

      const controllerWithInvalidConfig = new PasskeyController(invalidConfig);

      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);
      mockPrisma.passkey.findUnique.mockResolvedValue(passkeyWithUser);
      mockPrisma.passkey.update.mockResolvedValue(standardPasskey);
      mockPrisma.challenge.delete.mockResolvedValue(challengeRecord);

      // Setup WebAuthn mock for successful authentication
      setupWebAuthnMock(webauthnTestScenarios.successfulAuthentication);

      await controllerWithInvalidConfig.completePasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        details: expect.stringContaining('Invalid duration format')
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle very long passkey names', async () => {
      const longName = 'A'.repeat(255);
      const requestData = {
        name: longName,
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: standardPasskey.id },
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      const updatedPasskey = {
        ...standardPasskey,
        name: longName,
      };

      mockPrisma.passkey.findFirst.mockResolvedValue(standardPasskey);
      mockPrisma.passkey.update.mockResolvedValue(updatedPasskey);

      await passkeyController.renamePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockPrisma.passkey.update).toHaveBeenCalledWith({
        where: { id: standardPasskey.id },
        data: { name: longName },
        select: expect.any(Object),
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Passkey renamed successfully',
        passkey: updatedPasskey,
      });
    });

    it('should handle special characters in passkey names', async () => {
      const specialName = 'Device with émojis 🔑 and symbols!@#$%';
      const requestData = {
        name: specialName,
      };

      const authenticatedRequest = {
        ...mockRequest,
        params: { id: standardPasskey.id },
        body: requestData,
        userId: standardUser.id,
      } as AuthenticatedRequest & { params: { id: string } };

      const updatedPasskey = {
        ...standardPasskey,
        name: specialName,
      };

      mockPrisma.passkey.findFirst.mockResolvedValue(standardPasskey);
      mockPrisma.passkey.update.mockResolvedValue(updatedPasskey);

      await passkeyController.renamePasskey(authenticatedRequest, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Passkey renamed successfully',
        passkey: updatedPasskey,
      });
    });

    it('should handle maximum counter values', async () => {
      const requestData = {
        credential: authenticationResponse,
      };

      mockRequest.body = requestData;

      const challengeRecord = {
        id: 'challenge_123',
        challenge: 'YXV0aC1jaGFsbGVuZ2Vtc3RyaW5nLWZvci10ZXN0aW5n',
        userId: null,
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        email: null,
        createdAt: new Date(),
      };

      const passkeyWithMaxCounter = {
        ...standardPasskey,
        counter: Number.MAX_SAFE_INTEGER,
        user: standardUser,
      };

      mockPrisma.challenge.findUnique.mockResolvedValue(challengeRecord);
      mockPrisma.passkey.findUnique.mockResolvedValue(passkeyWithMaxCounter);
      mockPrisma.passkey.update.mockResolvedValue(passkeyWithMaxCounter);
      mockPrisma.challenge.delete.mockResolvedValue(challengeRecord);
      mockPrisma.refreshToken.create.mockResolvedValue(generateMockRefreshToken(standardUser.id));

      // Setup WebAuthn mock for successful authentication with high counter
      setupWebAuthnMock({
        authenticationVerification: {
          verified: true,
          authenticationInfo: {
            newCounter: Number.MAX_SAFE_INTEGER,
            credentialDeviceType: 'singleDevice',
            credentialBackedUp: false
          }
        }
      });

      await passkeyController.completePasskeyAuthentication(mockRequest as Request, mockResponse as Response);

      expect(mockPrisma.passkey.update).toHaveBeenCalledWith({
        where: { id: standardPasskey.id },
        data: {
          counter: BigInt(Number.MAX_SAFE_INTEGER),
          lastUsed: expect.any(Date),
        },
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });
});