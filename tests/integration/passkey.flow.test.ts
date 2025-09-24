/**
 * Passkey Flow Integration Tests
 *
 * Integration tests for complete passkey (WebAuthn) flows including:
 * - Complete passkey registration and authentication flow
 * - Authentication with both password and passkey options
 * - Passkey management operations
 * - Error handling across passkey components
 */

import { FirefunAuth, FirefunAuthConfig } from '../../src/index';
import { MockPrismaClient } from '../mocks/prisma.mock';
import { testConfig } from '../setup';
import { createMockRequest, createMockResponse } from '../mocks/express.mock';
import { generateMockUser } from '../helpers/data.generators';
import { webAuthnFixtures } from '../fixtures/webauthn.fixtures';

// Mock external dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('@simplewebauthn/server');

import jwt from 'jsonwebtoken';
import * as SimpleWebAuthnServer from '@simplewebauthn/server';

const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedWebAuthn = SimpleWebAuthnServer as jest.Mocked<typeof SimpleWebAuthnServer>;

describe('Passkey Flow Integration', () => {
  let firefunAuth: FirefunAuth;
  let mockPrisma: MockPrismaClient;
  let config: FirefunAuthConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new MockPrismaClient();
    config = { ...testConfig };
    config.prisma = mockPrisma;
    config.serverless = false;

    firefunAuth = new FirefunAuth(config);

    // Setup JWT mocking
    mockedJwt.sign.mockReturnValue('mock.jwt.token');
    mockedJwt.verify.mockReturnValue({ userId: 'user1', email: 'test@example.com' } as any);

    // Setup WebAuthn mocking
    mockedWebAuthn.generateRegistrationOptions.mockResolvedValue(webAuthnFixtures.registrationOptions as any);
    mockedWebAuthn.verifyRegistrationResponse.mockResolvedValue(webAuthnFixtures.verificationResult as any);
    mockedWebAuthn.generateAuthenticationOptions.mockResolvedValue(webAuthnFixtures.authenticationOptions as any);
    mockedWebAuthn.verifyAuthenticationResponse.mockResolvedValue(webAuthnFixtures.authVerificationResult as any);
  });

  describe('Complete Passkey Registration Flow', () => {
    it('should handle complete passkey registration flow', async () => {
      const testUser = generateMockUser();

      // Mock authenticated user
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Step 1: Start passkey registration
      const startReq = createMockRequest({
        body: { name: 'My Passkey' },
        user: { userId: testUser.id, email: testUser.email },
      });
      const startRes = createMockResponse();

      await firefunAuth.passkeyController.startPasskeyRegistration(startReq as any, startRes as any);

      expect(startRes.status).toHaveBeenCalledWith(200);
      expect(startRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          challenge: expect.any(String),
          rp: expect.objectContaining({
            name: config.webauthn.rpName,
            id: config.webauthn.rpId,
          }),
          user: expect.objectContaining({
            id: testUser.id,
            name: testUser.email,
            displayName: testUser.email,
          }),
        })
      );

      // Step 2: Complete passkey registration
      mockPrisma.passkey.create.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId123',
        publicKey: 'publicKey123',
        counter: 0,
        name: 'My Passkey',
        createdAt: new Date(),
      });

      const completeReq = createMockRequest({
        body: webAuthnFixtures.registrationResponse,
        user: { userId: testUser.id, email: testUser.email },
      });
      const completeRes = createMockResponse();

      await firefunAuth.passkeyController.completePasskeyRegistration(completeReq as any, completeRes as any);

      expect(completeRes.status).toHaveBeenCalledWith(200);
      expect(completeRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Passkey registered successfully',
          passkey: expect.objectContaining({
            id: 'passkey1',
            name: 'My Passkey',
          }),
        })
      );

      // Verify passkey was saved to database
      expect(mockPrisma.passkey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: testUser.id,
          credentialId: expect.any(String),
          publicKey: expect.any(String),
          counter: expect.any(Number),
          name: 'My Passkey',
        }),
      });
    });

    it('should handle passkey registration with invalid verification', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock failed verification
      mockedWebAuthn.verifyRegistrationResponse.mockResolvedValue({
        verified: false,
        registrationInfo: undefined,
      } as any);

      const req = createMockRequest({
        body: webAuthnFixtures.registrationResponse,
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.completePasskeyRegistration(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Passkey registration verification failed',
        })
      );
    });
  });

  describe('Complete Passkey Authentication Flow', () => {
    it('should handle complete passkey authentication flow', async () => {
      const testUser = generateMockUser();

      // Step 1: Start passkey authentication
      mockPrisma.passkey.findMany.mockResolvedValue([
        {
          id: 'passkey1',
          userId: testUser.id,
          credentialId: 'credId123',
          publicKey: 'publicKey123',
          counter: 1,
          name: 'My Passkey',
          createdAt: new Date(),
        },
      ]);

      const startReq = createMockRequest({
        body: {},
      });
      const startRes = createMockResponse();

      await firefunAuth.passkeyController.startPasskeyAuthentication(startReq as any, startRes as any);

      expect(startRes.status).toHaveBeenCalledWith(200);
      expect(startRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          challenge: expect.any(String),
          allowCredentials: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                type: 'public-key',
              }),
            ]),
        })
      );

      // Step 2: Complete passkey authentication
      mockPrisma.passkey.findUnique.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId123',
        publicKey: 'publicKey123',
        counter: 1,
        name: 'My Passkey',
        createdAt: new Date(),
        user: {
          id: testUser.id,
          email: testUser.email,
          hashedPassword: '$2b$10$hashedPassword',
          twoFactorEnabled: false,
          twoFactorSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      mockPrisma.passkey.update.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId123',
        publicKey: 'publicKey123',
        counter: 2, // Incremented
        name: 'My Passkey',
        createdAt: new Date(),
      });

      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'token1',
        userId: testUser.id,
        token: 'refreshToken123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const completeReq = createMockRequest({
        body: webAuthnFixtures.authenticationResponse,
      });
      const completeRes = createMockResponse();

      await firefunAuth.passkeyController.completePasskeyAuthentication(completeReq as any, completeRes as any);

      expect(completeRes.status).toHaveBeenCalledWith(200);
      expect(completeRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock.jwt.token',
          refreshToken: 'refreshToken123',
          user: expect.objectContaining({
            id: testUser.id,
            email: testUser.email,
          }),
        })
      );

      // Verify counter was updated
      expect(mockPrisma.passkey.update).toHaveBeenCalledWith({
        where: { credentialId: 'credId123' },
        data: { counter: expect.any(Number) },
      });
    });

    it('should handle passkey authentication with invalid verification', async () => {
      // Mock failed authentication verification
      mockedWebAuthn.verifyAuthenticationResponse.mockResolvedValue({
        verified: false,
        authenticationInfo: undefined,
      } as any);

      const req = createMockRequest({
        body: webAuthnFixtures.authenticationResponse,
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.completePasskeyAuthentication(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Passkey authentication failed',
        })
      );
    });

    it('should handle passkey authentication with non-existent credentialId', async () => {
      mockPrisma.passkey.findUnique.mockResolvedValue(null);

      const req = createMockRequest({
        body: webAuthnFixtures.authenticationResponse,
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.completePasskeyAuthentication(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid passkey',
        })
      );
    });
  });

  describe('Authentication with Both Password and Passkey Options', () => {
    it('should allow user to choose between password and passkey authentication', async () => {
      const testUser = generateMockUser();

      // User should be able to use traditional login
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'token1',
        userId: testUser.id,
        token: 'passwordRefreshToken',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      // Traditional password login
      const passwordReq = createMockRequest({
        body: {
          email: testUser.email,
          password: 'validPassword123!',
        },
      });
      const passwordRes = createMockResponse();

      await firefunAuth.authController.loginUser(passwordReq as any, passwordRes as any);

      expect(passwordRes.status).toHaveBeenCalledWith(200);
      expect(passwordRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock.jwt.token',
          refreshToken: 'passwordRefreshToken',
        })
      );

      // Reset mocks for passkey authentication
      jest.clearAllMocks();
      mockedJwt.sign.mockReturnValue('mock.jwt.token');

      // User should also be able to use passkey authentication
      mockPrisma.passkey.findUnique.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId123',
        publicKey: 'publicKey123',
        counter: 1,
        name: 'My Passkey',
        createdAt: new Date(),
        user: {
          id: testUser.id,
          email: testUser.email,
          hashedPassword: '$2b$10$hashedPassword',
          twoFactorEnabled: false,
          twoFactorSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      mockPrisma.passkey.update.mockResolvedValue({} as any);
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'token2',
        userId: testUser.id,
        token: 'passkeyRefreshToken',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      // Passkey authentication
      const passkeyReq = createMockRequest({
        body: webAuthnFixtures.authenticationResponse,
      });
      const passkeyRes = createMockResponse();

      await firefunAuth.passkeyController.completePasskeyAuthentication(passkeyReq as any, passkeyRes as any);

      expect(passkeyRes.status).toHaveBeenCalledWith(200);
      expect(passkeyRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock.jwt.token',
          refreshToken: 'passkeyRefreshToken',
        })
      );
    });

    it('should handle user with both 2FA and passkey options', async () => {
      const testUser = generateMockUser();

      // User with 2FA enabled
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: true,
        twoFactorSecret: 'encryptedSecret',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // User should still be able to use passkey authentication (bypassing 2FA)
      mockPrisma.passkey.findUnique.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId123',
        publicKey: 'publicKey123',
        counter: 1,
        name: 'My Passkey',
        createdAt: new Date(),
        user: {
          id: testUser.id,
          email: testUser.email,
          hashedPassword: '$2b$10$hashedPassword',
          twoFactorEnabled: true,
          twoFactorSecret: 'encryptedSecret',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      mockPrisma.passkey.update.mockResolvedValue({} as any);
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'token1',
        userId: testUser.id,
        token: 'passkeyRefreshToken',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const req = createMockRequest({
        body: webAuthnFixtures.authenticationResponse,
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.completePasskeyAuthentication(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock.jwt.token',
          refreshToken: 'passkeyRefreshToken',
        })
      );
    });
  });

  describe('Passkey Management Operations', () => {
    it('should handle complete passkey listing flow', async () => {
      const testUser = generateMockUser();

      mockPrisma.passkey.findMany.mockResolvedValue([
        {
          id: 'passkey1',
          userId: testUser.id,
          credentialId: 'credId1',
          publicKey: 'publicKey1',
          counter: 1,
          name: 'Home Computer',
          createdAt: new Date('2023-01-01'),
        },
        {
          id: 'passkey2',
          userId: testUser.id,
          credentialId: 'credId2',
          publicKey: 'publicKey2',
          counter: 5,
          name: 'Phone',
          createdAt: new Date('2023-01-02'),
        },
      ]);

      const req = createMockRequest({
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.listPasskeys(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          passkeys: expect.arrayContaining([
            expect.objectContaining({
              id: 'passkey1',
              name: 'Home Computer',
              createdAt: expect.any(String),
            }),
            expect.objectContaining({
              id: 'passkey2',
              name: 'Phone',
              createdAt: expect.any(String),
            }),
          ]),
        })
      );
    });

    it('should handle passkey deletion flow', async () => {
      const testUser = generateMockUser();

      mockPrisma.passkey.findUnique.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId1',
        publicKey: 'publicKey1',
        counter: 1,
        name: 'Old Passkey',
        createdAt: new Date(),
      });

      mockPrisma.passkey.delete.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId1',
        publicKey: 'publicKey1',
        counter: 1,
        name: 'Old Passkey',
        createdAt: new Date(),
      });

      const req = createMockRequest({
        params: { id: 'passkey1' },
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.deletePasskey(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Passkey deleted successfully',
        })
      );

      expect(mockPrisma.passkey.delete).toHaveBeenCalledWith({
        where: { id: 'passkey1', userId: testUser.id },
      });
    });

    it('should handle passkey renaming flow', async () => {
      const testUser = generateMockUser();

      mockPrisma.passkey.findUnique.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId1',
        publicKey: 'publicKey1',
        counter: 1,
        name: 'Old Name',
        createdAt: new Date(),
      });

      mockPrisma.passkey.update.mockResolvedValue({
        id: 'passkey1',
        userId: testUser.id,
        credentialId: 'credId1',
        publicKey: 'publicKey1',
        counter: 1,
        name: 'New Name',
        createdAt: new Date(),
      });

      const req = createMockRequest({
        params: { id: 'passkey1' },
        body: { name: 'New Name' },
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.renamePasskey(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Passkey renamed successfully',
          passkey: expect.objectContaining({
            id: 'passkey1',
            name: 'New Name',
          }),
        })
      );
    });

    it('should handle unauthorized passkey management attempts', async () => {
      const testUser = generateMockUser();
      const otherUser = generateMockUser();

      // Mock passkey belonging to a different user
      mockPrisma.passkey.findUnique.mockResolvedValue({
        id: 'passkey1',
        userId: otherUser.id, // Different user
        credentialId: 'credId1',
        publicKey: 'publicKey1',
        counter: 1,
        name: 'Other User Passkey',
        createdAt: new Date(),
      });

      const req = createMockRequest({
        params: { id: 'passkey1' },
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.deletePasskey(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Passkey not found',
        })
      );
    });
  });

  describe('Error Handling in Passkey Flows', () => {
    it('should handle WebAuthn library errors during registration', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock WebAuthn error
      mockedWebAuthn.generateRegistrationOptions.mockRejectedValue(new Error('WebAuthn error'));

      const req = createMockRequest({
        body: { name: 'My Passkey' },
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.startPasskeyRegistration(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'WebAuthn error',
        })
      );
    });

    it('should handle database errors during passkey operations', async () => {
      const testUser = generateMockUser();

      // Mock database error
      mockPrisma.passkey.findMany.mockRejectedValue(new Error('Database connection lost'));

      const req = createMockRequest({
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.passkeyController.listPasskeys(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Database connection lost',
        })
      );
    });
  });
});