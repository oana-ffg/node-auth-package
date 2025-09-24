/**
 * AuthController Unit Tests
 *
 * Comprehensive tests for all AuthController methods including:
 * - User registration with valid and invalid data
 * - User login with correct and incorrect credentials
 * - JWT token generation and validation
 * - Refresh token functionality
 * - Password hashing and verification
 * - Account deletion functionality
 * - Error handling for authentication failures
 */

import { AuthController, AuthControllerConfig } from '../../src/controllers/authController';
import { MockPrismaClient } from '../mocks/prisma.mock';
import { generateMockUser, generateMockUserWith2FA, generateMockRefreshToken } from '../helpers/data.generators';
import { testConfig } from '../setup';
import { Request, Response } from 'express';
import { MockRequest, MockResponse, createMockRequest, createMockResponse } from '../mocks/express.mock';

// Mock external dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('crypto');
jest.mock('speakeasy');
jest.mock('qrcode');

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedCrypto = crypto as jest.Mocked<typeof crypto>;

describe('AuthController', () => {
  let authController: AuthController;
  let mockPrisma: MockPrismaClient;
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let config: AuthControllerConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock instances
    mockPrisma = new MockPrismaClient();
    mockRequest = createMockRequest();
    mockResponse = createMockResponse();

    // Setup test configuration
    config = {
      ...testConfig,
      prisma: mockPrisma as any,
    };

    // Initialize controller
    authController = new AuthController(config);

    // Setup default mock implementations
    mockedBcrypt.hash.mockResolvedValue('hashed_password');
    mockedBcrypt.compare.mockResolvedValue(true);
    mockedJwt.sign.mockReturnValue('mock_jwt_token');
    mockedJwt.verify.mockReturnValue({ userId: 'test-user-id' });
    mockedCrypto.randomUUID.mockReturnValue('mock-refresh-token-uuid');
  });

  describe('registerUser', () => {
    it('should register user with valid data', async () => {
      const validUserData = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      mockRequest.body = validUserData;
      mockPrisma.user.findUnique.mockResolvedValue(null); // No existing user

      const newUser = generateMockUser({
        email: validUserData.email,
        password: 'hashed_password',
      });
      mockPrisma.user.create.mockResolvedValue(newUser);

      await authController.registerUser(mockRequest as Request, mockResponse as Response);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: validUserData.email }
      });
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(validUserData.password, config.security.bcryptRounds);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: validUserData.email,
          password: 'hashed_password',
        }
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'User registered successfully.',
        user: {
          id: newUser.id,
          email: newUser.email,
          createdAt: newUser.createdAt,
        },
      });
    });

    it('should reject invalid email format', async () => {
      mockRequest.body = {
        email: 'invalid-email',
        password: 'ValidPassword123!',
      };

      await authController.registerUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          fieldErrors: expect.objectContaining({
            email: expect.arrayContaining([expect.stringContaining('Invalid email')])
          })
        })
      });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should reject weak passwords', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'weak',
      };

      await authController.registerUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          fieldErrors: expect.objectContaining({
            password: expect.arrayContaining([expect.stringContaining('at least 8 characters')])
          })
        })
      });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should accept passwords with exclamation marks and special characters', async () => {
      const validUserData = {
        email: 'test@example.com',
        password: 'Password123!@#$',
      };

      mockRequest.body = validUserData;
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const newUser = generateMockUser({
        email: validUserData.email,
        password: 'hashed_password',
      });
      mockPrisma.user.create.mockResolvedValue(newUser);

      await authController.registerUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(validUserData.password, config.security.bcryptRounds);
    });

    it('should reject duplicate email registration', async () => {
      const existingUser = generateMockUser({ email: 'test@example.com' });

      mockRequest.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      await authController.registerUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'User already exists.'
      });
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during registration', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockRejectedValue(new Error('Database connection error'));

      await authController.registerUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });

    it('should handle bcrypt hashing errors', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockedBcrypt.hash.mockRejectedValue(new Error('Hashing failed'));

      await authController.registerUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });

  describe('loginUser', () => {
    it('should login with correct credentials (no 2FA)', async () => {
      const user = generateMockUser({
        email: 'test@example.com',
        twoFactorEnabled: false,
      });

      mockRequest.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(true);

      const mockRefreshToken = generateMockRefreshToken(user.id);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      await authController.loginUser(mockRequest as Request, mockResponse as Response);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith('ValidPassword123!', user.password);
      expect(mockedJwt.sign).toHaveBeenCalledWith(
        { userId: user.id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Login successful',
        accessToken: 'mock_jwt_token',
        refreshToken: 'mock-refresh-token-uuid',
        user: {
          id: user.id,
          email: user.email,
          twoFactorEnabled: user.twoFactorEnabled,
        },
      });
    });

    it('should require 2FA when enabled', async () => {
      const user = generateMockUserWith2FA({
        email: 'test@example.com',
      });

      mockRequest.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(true);

      await authController.loginUser(mockRequest as Request, mockResponse as Response);

      expect(mockedJwt.sign).toHaveBeenCalledWith(
        {
          userId: user.id,
          temp: true,
          purpose: '2fa_verification'
        },
        config.jwt.secret,
        { expiresIn: '5m' }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: '2FA verification required',
        requires2FA: true,
        tempToken: 'mock_jwt_token',
        user: {
          id: user.id,
          email: user.email,
        },
      });
    });

    it('should reject non-existent user', async () => {
      mockRequest.body = {
        email: 'nonexistent@example.com',
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await authController.loginUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid credentials.'
      });
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should reject incorrect password', async () => {
      const user = generateMockUser({ email: 'test@example.com' });

      mockRequest.body = {
        email: 'test@example.com',
        password: 'WrongPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(false);

      await authController.loginUser(mockRequest as Request, mockResponse as Response);

      expect(mockedBcrypt.compare).toHaveBeenCalledWith('WrongPassword123!', user.password);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid credentials.'
      });
    });

    it('should reject invalid login data format', async () => {
      mockRequest.body = {
        email: 'invalid-email',
        password: '', // Empty password
      };

      await authController.loginUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          fieldErrors: expect.any(Object)
        })
      });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should handle database errors during login', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await authController.loginUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });

  describe('refreshTokenHandler', () => {
    it('should refresh token with valid refresh token', async () => {
      const user = generateMockUser();
      const refreshToken = generateMockRefreshToken(user.id);
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      refreshToken.expiresAt = futureDate;

      mockRequest.body = {
        refreshToken: refreshToken.token,
      };

      // First add the token to the mock's storage, then set up find to return it
      await mockPrisma.refreshToken.create({ data: refreshToken });

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...refreshToken,
        user,
      });
      // Mock the individual operations inside the transaction
      mockPrisma.refreshToken.delete.mockResolvedValue(refreshToken);
      mockPrisma.refreshToken.create.mockResolvedValue({
        ...refreshToken,
        token: 'new-refresh-token',
        id: 'new-token-id',
      });

      mockPrisma.$transaction.mockImplementation(async (operations: any[]) => {
        // Execute the operations to trigger the mocks
        const results = [];
        for (const operation of operations) {
          results.push(await operation);
        }
        return results;
      });

      await authController.refreshTokenHandler(mockRequest as Request, mockResponse as Response);

      expect(mockPrisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: refreshToken.token },
        include: { user: true },
      });
      expect(mockedJwt.sign).toHaveBeenCalledWith(
        { userId: user.id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Token refreshed successfully',
        accessToken: 'mock_jwt_token',
        refreshToken: 'mock-refresh-token-uuid',
      });
    });

    it('should reject invalid refresh token', async () => {
      mockRequest.body = {
        refreshToken: 'invalid-token',
      };

      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await authController.refreshTokenHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid refresh token.'
      });
    });

    it('should reject expired refresh token', async () => {
      const user = generateMockUser();
      const refreshToken = generateMockRefreshToken(user.id);
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      refreshToken.expiresAt = pastDate;

      mockRequest.body = {
        refreshToken: refreshToken.token,
      };

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...refreshToken,
        user,
      });

      await authController.refreshTokenHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Refresh token has expired.'
      });
    });

    it('should reject malformed refresh token request', async () => {
      mockRequest.body = {
        // Missing refreshToken field
      };

      await authController.refreshTokenHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          fieldErrors: expect.any(Object)
        })
      });
    });

    it('should handle database errors during token refresh', async () => {
      mockRequest.body = {
        refreshToken: 'valid-token',
      };

      mockPrisma.refreshToken.findUnique.mockRejectedValue(new Error('Database error'));

      await authController.refreshTokenHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });

  describe('deleteAccount', () => {
    it('should delete account with valid password', async () => {
      const user = generateMockUser({ email: 'test@example.com' });

      mockRequest.userId = user.id;
      mockRequest.body = {
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(true);
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        // Mock transaction callback
        const tx = {
          user: {
            findUnique: jest.fn().mockResolvedValue(user),
            delete: jest.fn().mockResolvedValue(user),
          }
        };
        return await callback(tx);
      });

      await authController.deleteAccount(mockRequest as any, mockResponse as Response);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: user.id }
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith('ValidPassword123!', user.password);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Account deleted successfully. All data has been permanently removed.',
      });
    });

    it('should reject unauthorized request', async () => {
      mockRequest.userId = undefined;
      mockRequest.body = {
        password: 'ValidPassword123!',
      };

      await authController.deleteAccount(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized'
      });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should reject incorrect password', async () => {
      const user = generateMockUser({ email: 'test@example.com' });

      mockRequest.userId = user.id;
      mockRequest.body = {
        password: 'WrongPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(false);

      await authController.deleteAccount(mockRequest as any, mockResponse as Response);

      expect(mockedBcrypt.compare).toHaveBeenCalledWith('WrongPassword123!', user.password);
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid password.'
      });
    });

    it('should handle non-existent user', async () => {
      mockRequest.userId = 'non-existent-id';
      mockRequest.body = {
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await authController.deleteAccount(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'User not found'
      });
    });

    it('should reject malformed delete request', async () => {
      mockRequest.userId = 'user-id';
      mockRequest.body = {
        // Missing password field
      };

      await authController.deleteAccount(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          fieldErrors: expect.any(Object)
        })
      });
    });

    it('should handle database errors during account deletion', async () => {
      const user = generateMockUser({ email: 'test@example.com' });

      mockRequest.userId = user.id;
      mockRequest.body = {
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(true);
      mockPrisma.$transaction.mockRejectedValue(new Error('Database error'));

      await authController.deleteAccount(mockRequest as any, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle JWT signing errors', async () => {
      const user = generateMockUser({ twoFactorEnabled: false });

      mockRequest.body = {
        email: user.email,
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(true);
      mockedJwt.sign.mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      await authController.loginUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });

    it('should handle crypto UUID generation errors', async () => {
      const user = generateMockUser({ twoFactorEnabled: false });

      mockRequest.body = {
        email: user.email,
        password: 'ValidPassword123!',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(true);
      mockedCrypto.randomUUID.mockImplementation(() => {
        throw new Error('UUID generation failed');
      });

      await authController.loginUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });

    it('should handle malformed request body', async () => {
      mockRequest.body = {
        email: null,
        password: undefined,
      };

      await authController.registerUser(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          fieldErrors: expect.any(Object)
        })
      });
    });

    it('should handle refresh token transaction failures', async () => {
      const user = generateMockUser();
      const refreshToken = generateMockRefreshToken(user.id);
      const futureDate = new Date(Date.now() + 1000 * 60 * 60);
      refreshToken.expiresAt = futureDate;

      mockRequest.body = {
        refreshToken: refreshToken.token,
      };

      // Add the token to the mock's storage first
      await mockPrisma.refreshToken.create({ data: refreshToken });

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...refreshToken,
        user,
      });
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      await authController.refreshTokenHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });
});