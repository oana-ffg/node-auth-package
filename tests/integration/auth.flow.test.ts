/**
 * Authentication Flow Integration Tests
 *
 * Complete end-to-end integration tests for authentication flows including:
 * - User registration and login flow
 * - 2FA setup and verification flow
 * - Passkey registration and authentication flow
 * - Session management and token refresh cycles
 * - Error propagation across components
 */

import { FirefunAuth, FirefunAuthConfig } from '../../src/index';
import { MockPrismaClient } from '../mocks/prisma.mock';
import { testConfig } from '../setup';
import { createMockRequest, createMockResponse, MockRequest, MockResponse } from '../mocks/express.mock';
import { generateMockUser, generateMockRefreshToken } from '../helpers/data.generators';
import { expectValidJWT, expectValidUser } from '../helpers/assertions';

// Mock external dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('speakeasy');
jest.mock('qrcode');
jest.mock('@simplewebauthn/server');

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedSpeakeasy = speakeasy as jest.Mocked<typeof speakeasy>;
const mockedQRCode = QRCode as jest.Mocked<typeof QRCode>;

describe('Authentication Flow Integration', () => {
  let firefunAuth: FirefunAuth;
  let mockPrisma: MockPrismaClient;
  let config: FirefunAuthConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new MockPrismaClient();
    config = { ...testConfig };
    config.prisma = mockPrisma;
    config.serverless = false; // Test standard mode

    firefunAuth = new FirefunAuth(config);

    // Setup mock implementations
    mockedBcrypt.hash.mockResolvedValue('$2b$10$hashedPassword' as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedJwt.sign.mockReturnValue('mock.jwt.token');
    mockedJwt.verify.mockReturnValue({ userId: 'user1', email: 'test@example.com' } as any);
  });

  describe('Complete User Registration and Login Flow', () => {
    it('should handle complete registration and login flow', async () => {
      const testUser = generateMockUser();
      const password = 'ValidPassword123!';

      // Mock user creation
      mockPrisma.user.findUnique.mockResolvedValue(null); // User doesn't exist
      mockPrisma.user.create.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Step 1: User Registration
      const regReq = createMockRequest({
        body: {
          email: testUser.email,
          password: password,
        },
      });
      const regRes = createMockResponse();

      await firefunAuth.authController.registerUser(regReq as any, regRes as any);

      expect(regRes.status).toHaveBeenCalledWith(201);
      expect(regRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User registered successfully.',
          user: expect.objectContaining({
            id: expect.any(String),
            email: testUser.email,
            createdAt: expect.any(Date),
          }),
        })
      );

      // Step 2: User Login
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'token1',
        userId: testUser.id,
        token: 'refreshToken123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const loginReq = createMockRequest({
        body: {
          email: testUser.email,
          password: 'validPassword123!',
        },
      });
      const loginRes = createMockResponse();

      await firefunAuth.authController.loginUser(loginReq as any, loginRes as any);

      expect(loginRes.status).toHaveBeenCalledWith(200);
      expect(loginRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Login successful',
          accessToken: 'mock.jwt.token',
          refreshToken: expect.any(String),
          user: expect.objectContaining({
            id: testUser.id,
            email: testUser.email,
            twoFactorEnabled: false,
          }),
        })
      );
    });

    it('should handle registration with existing email', async () => {
      const testUser = generateMockUser();

      // Mock existing user
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existingId',
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({
        body: {
          email: testUser.email,
          password: 'ValidPassword123!',
        },
      });
      const res = createMockResponse();

      await firefunAuth.authController.registerUser(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User already exists.',
        })
      );
    });

    it('should handle login with invalid credentials', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock bcrypt to return false for invalid password
      mockedBcrypt.compare.mockResolvedValue(false as never);

      const req = createMockRequest({
        body: {
          email: testUser.email,
          password: 'wrongPassword',
        },
      });
      const res = createMockResponse();

      await firefunAuth.authController.loginUser(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid credentials.',
        })
      );
    });
  });

  describe('Complete 2FA Setup and Verification Flow', () => {
    beforeEach(() => {
      // Mock 2FA operations
      mockedSpeakeasy.generateSecret.mockReturnValue({
        base32: 'MOCK2FASECRET',
        otpauth_url: 'otpauth://totp/TestApp:test@example.com?secret=MOCK2FASECRET&issuer=TestApp',
      } as any);
      mockedSpeakeasy.totp.verify.mockReturnValue({ delta: 0 });
      mockedQRCode.toDataURL.mockResolvedValue('data:image/png;base64,mockQRCode');
    });

    it('should handle complete 2FA setup flow', async () => {
      const testUser = generateMockUser();

      // Mock authenticated user
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Step 1: Generate 2FA secret
      const secretReq = createMockRequest({
        body: {},
        user: { userId: testUser.id, email: testUser.email },
      });
      const secretRes = createMockResponse();

      await firefunAuth.authController.generate2FASecret(secretReq as any, secretRes as any);

      expect(secretRes.status).toHaveBeenCalledWith(200);
      expect(secretRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          otpauthUrl: expect.any(String),
          qrCodeDataURL: expect.any(String)
        })
      );

      // Step 2: Confirm 2FA setup
      mockPrisma.user.update.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: true,
        twoFactorSecret: 'encryptedSecret',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const confirmReq = createMockRequest({
        body: { code: '123456' },
        user: { userId: testUser.id, email: testUser.email },
      });
      const confirmRes = createMockResponse();

      await firefunAuth.authController.confirm2FA(confirmReq as any, confirmRes as any);

      expect(confirmRes.status).toHaveBeenCalledWith(200);
      expect(confirmRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '2FA enabled successfully',
          twoFactorEnabled: true
        })
      );

      // Step 3: Login with 2FA
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: true,
        twoFactorSecret: 'encryptedSecret',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const loginWith2FAReq = createMockRequest({
        body: {
          email: testUser.email,
          password: 'validPassword123!',
          twoFactorCode: '123456',
        },
      });
      const loginWith2FARes = createMockResponse();

      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'token2',
        userId: testUser.id,
        token: 'refreshToken456',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      await firefunAuth.authController.loginWith2FA(loginWith2FAReq as any, loginWith2FARes as any);

      expect(loginWith2FARes.status).toHaveBeenCalledWith(200);
      expect(loginWith2FARes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Login successful',
          accessToken: 'mock.jwt.token',
          refreshToken: expect.any(String),
          user: expect.objectContaining({
            id: expect.any(String),
            email: expect.any(String)
          })
        })
      );
    });

    it('should handle 2FA verification with invalid code', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: true,
        twoFactorSecret: 'encryptedSecret',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock invalid TOTP verification
      mockedSpeakeasy.totp.verify.mockReturnValue(false);

      const req = createMockRequest({
        body: {
          email: testUser.email,
          password: 'validPassword123!',
          twoFactorCode: '000000',
        },
      });
      const res = createMockResponse();

      await firefunAuth.authController.loginWith2FA(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid 2FA code.'
        })
      );
    });

    it('should handle 2FA reset flow', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: true,
        twoFactorSecret: 'encryptedSecret',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.user.update.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({
        body: {},
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.authController.reset2FA(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '2FA reset successfully. Please scan the new QR code and confirm setup.',
          otpauthUrl: expect.any(String),
          qrCodeDataURL: expect.any(String)
        })
      );
    });
  });

  describe('Session Management and Token Refresh', () => {
    it('should handle token refresh flow', async () => {
      const testUser = generateMockUser();
      const refreshToken = 'validRefreshToken123';

      // Mock valid refresh token
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token1',
        userId: testUser.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Future date
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

      // Mock new refresh token creation
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'newToken1',
        userId: testUser.id,
        token: 'newRefreshToken123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      // Mock old token deletion
      mockPrisma.refreshToken.delete.mockResolvedValue({} as any);

      const req = createMockRequest({
        body: { refreshToken },
      });
      const res = createMockResponse();

      await firefunAuth.authController.refreshTokenHandler(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Token refreshed successfully',
          accessToken: 'mock.jwt.token'
        })
      );

      // Verify old token was deleted and new one created
      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { token: refreshToken },
      });
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
    });

    it('should handle expired refresh token', async () => {
      const refreshToken = 'expiredRefreshToken123';

      // Mock expired refresh token
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token1',
        userId: 'user1',
        token: refreshToken,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Past date (expired)
        createdAt: new Date(),
        user: {
          id: 'user1',
          email: 'test@example.com',
          hashedPassword: '$2b$10$hashedPassword',
          twoFactorEnabled: false,
          twoFactorSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const req = createMockRequest({
        body: { refreshToken },
      });
      const res = createMockResponse();

      await firefunAuth.authController.refreshTokenHandler(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid refresh token.'
        })
      );
    });

    it('should handle invalid refresh token', async () => {
      const refreshToken = 'invalidRefreshToken';

      // Mock no refresh token found
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      const req = createMockRequest({
        body: { refreshToken },
      });
      const res = createMockResponse();

      await firefunAuth.authController.refreshTokenHandler(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid refresh token.'
        })
      );
    });
  });

  describe('Error Propagation Across Components', () => {
    it('should handle database errors gracefully in registration flow', async () => {
      const testUser = generateMockUser();

      // Mock database error
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      const req = createMockRequest({
        body: {
          email: testUser.email,
          password: 'ValidPassword123!',
        },
      });
      const res = createMockResponse();

      await firefunAuth.authController.registerUser(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('should handle JWT errors gracefully', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock JWT error
      mockedJwt.sign.mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      const req = createMockRequest({
        body: {
          email: testUser.email,
          password: 'validPassword123!',
        },
      });
      const res = createMockResponse();

      await firefunAuth.authController.loginUser(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('should handle encryption errors gracefully', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock speakeasy to throw error
      mockedSpeakeasy.generateSecret.mockImplementation(() => {
        throw new Error('2FA secret generation failed');
      });

      const req = createMockRequest({
        body: {},
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.authController.generate2FASecret(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });
  });

  describe('Account Management Integration', () => {
    it('should handle complete account deletion flow', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock cascade deletion
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.passkey.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        encryptionVersion: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({
        body: {},
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      await firefunAuth.authController.deleteAccount(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Account deleted successfully. All data has been permanently removed.'
        })
      );

      // Verify all related data was deleted
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: testUser.id },
      });
      expect(mockPrisma.passkey.deleteMany).toHaveBeenCalledWith({
        where: { userId: testUser.id },
      });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: testUser.id },
      });
    });
  });
});