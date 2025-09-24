/**
 * Serverless Integration Tests
 *
 * Integration tests for serverless mode functionality including:
 * - Complete serverless endpoint flows
 * - Serverless middleware integration
 * - Performance comparisons
 * - Error handling across serverless components
 */

import { FirefunAuth } from '../../src/index';
import {
  registerUser,
  loginUser,
  createServerlessAuthMiddleware,
  createServerlessHandler,
  performServerlessCleanup
} from '../../src/serverless';
import { MockPrismaClient } from '../mocks/prisma.mock';
import { testConfig } from '../setup';
import { MockRequest, MockResponse, createMockRequest, createMockResponse } from '../mocks/express.mock';
import { Request, Response } from 'express';

// Mock external dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('speakeasy');
jest.mock('qrcode');

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('Serverless Integration', () => {
  let mockPrisma: MockPrismaClient;
  let serverlessConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new MockPrismaClient();

    serverlessConfig = {
      ...testConfig,
      prisma: mockPrisma,
      serverless: true,
    };

    // Mock bcrypt
    mockedBcrypt.hash.mockResolvedValue('hashed-password');
    mockedBcrypt.compare.mockResolvedValue(true);

    // Mock JWT
    mockedJwt.sign.mockReturnValue('mock-jwt-token');
    mockedJwt.verify.mockReturnValue({ userId: '1' } as any);
  });

  describe('complete serverless authentication flow', () => {
    it('should handle complete user registration flow in serverless environment', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();

      mockRequest.body = {
        email: 'test@example.com',
        password: 'Test123!@#'
      };

      // Mock database responses
      mockPrisma.user.findUnique.mockResolvedValue(null); // User doesn't exist
      mockPrisma.user.create.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        hashedPassword: 'hashed-password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: '1',
        userId: '1',
        token: 'refresh-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await registerUser(mockRequest as Request, mockResponse as Response, serverlessConfig);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'User registered successfully.',
        user: {
          id: '1',
          email: 'test@example.com',
          createdAt: expect.any(Date),
        },
      });
    });

    it('should handle complete user login flow in serverless environment', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();

      mockRequest.body = {
        email: 'test@example.com',
        password: 'Test123!@#'
      };

      // Mock database responses
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        hashedPassword: 'hashed-password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: '1',
        userId: '1',
        token: 'refresh-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await loginUser(mockRequest as Request, mockResponse as Response, serverlessConfig);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Login successful',
        accessToken: 'mock-jwt-token',
        refreshToken: expect.any(String),
        user: {
          id: '1',
          email: 'test@example.com',
          twoFactorEnabled: false,
        },
      });
    });

    it('should handle authentication errors gracefully in serverless environment', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();

      mockRequest.body = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      // Mock user exists but password doesn't match
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        hashedPassword: 'hashed-password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock password comparison to fail
      mockedBcrypt.compare.mockResolvedValue(false);

      await loginUser(mockRequest as Request, mockResponse as Response, serverlessConfig);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });
  });

  describe('serverless middleware integration', () => {
    it('should integrate auth middleware with serverless handlers', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();

      // Mock authenticated request
      mockRequest.headers.authorization = 'Bearer valid-token';
      mockRequest.user = { userId: '1' };

      const middleware = createServerlessAuthMiddleware(serverlessConfig);
      expect(typeof middleware).toBe('function');

      // Mock the middleware to call next()
      const mockNext = jest.fn();
      await new Promise<void>((resolve) => {
        middleware(mockRequest as Request, mockResponse as Response, () => {
          mockNext();
          resolve();
        });
      });

      // Should handle authentication
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle middleware errors in serverless environment', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();

      // No authorization header
      delete mockRequest.headers.authorization;

      const middleware = createServerlessAuthMiddleware(serverlessConfig);
      const mockNext = jest.fn();

      // Call middleware
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // The middleware should respond directly and not call next()
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'No authorization header provided.'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('serverless performance characteristics', () => {
    it('should demonstrate fast cold start performance', async () => {
      const startTime = process.hrtime.bigint();

      const auth = new FirefunAuth(serverlessConfig);

      // Simulate first request that triggers component loading
      const controller = auth.authController;
      expect(controller).toBeDefined();

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds

      // Should complete within reasonable time for cold start
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });

    it('should handle multiple rapid requests efficiently', async () => {
      const auth = new FirefunAuth(serverlessConfig);

      const requests = Array.from({ length: 10 }, (_, i) => {
        const mockRequest = createMockRequest();
        const mockResponse = createMockResponse();
        mockRequest.body = { email: `test${i}@example.com`, password: 'Test123!@#' };
        return { mockRequest, mockResponse };
      });

      // Mock database responses for all requests
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        hashedPassword: 'hashed-password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: '1',
        userId: '1',
        token: 'refresh-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const startTime = process.hrtime.bigint();

      // Process all requests
      await Promise.all(
        requests.map(({ mockRequest, mockResponse }) =>
          registerUser(mockRequest as Request, mockResponse as Response, serverlessConfig)
        )
      );

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;

      // All requests should complete reasonably quickly
      expect(duration).toBeLessThan(5000); // Less than 5 seconds for 10 requests
    });
  });

  describe('serverless cleanup integration', () => {
    it('should perform integrated cleanup operations', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback(mockPrisma);
      });

      const result = await performServerlessCleanup(serverlessConfig);

      expect(result).toBeDefined();
      expect(result.refreshTokensDeleted).toBeDefined();
      expect(result.challengesDeleted).toBeDefined();
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalled();
    });

    it('should handle cleanup failures gracefully', async () => {
      mockPrisma.refreshToken.deleteMany.mockRejectedValue(new Error('Database connection failed'));

      const result = await performServerlessCleanup(serverlessConfig);

      // In serverless mode, errors should be caught and default values returned
      expect(result).toEqual({
        refreshTokensDeleted: 0,
        challengesDeleted: 0,
      });
    });
  });

  describe('serverless error propagation', () => {
    it('should propagate validation errors correctly', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();

      // Invalid email format
      mockRequest.body = {
        email: 'invalid-email',
        password: 'Test123!@#'
      };

      await registerUser(mockRequest as Request, mockResponse as Response, serverlessConfig);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should propagate database errors correctly', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();

      mockRequest.body = {
        email: 'test@example.com',
        password: 'Test123!@#'
      };

      // Mock database error
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      await registerUser(mockRequest as Request, mockResponse as Response, serverlessConfig);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should handle JSON parsing errors in serverless functions', async () => {
      const mockRequest = createMockRequest();
      const mockResponse = createMockResponse();

      // Set invalid body that will cause JSON parsing to fail
      mockRequest.body = undefined;

      await registerUser(mockRequest as Request, mockResponse as Response, serverlessConfig);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid JSON body'),
          details: expect.objectContaining({
            reason: 'Failed to parse request body',
            help: expect.any(String),
            details: expect.any(String),
          }),
        })
      );
    });
  });

  describe('serverless component lifecycle', () => {
    it('should initialize components on demand across multiple requests', async () => {
      const auth = new FirefunAuth(serverlessConfig);

      // Initially no components loaded
      expect((auth as any)._authController).toBeUndefined();
      expect((auth as any)._passkeyController).toBeUndefined();

      // First request loads auth controller
      const authController = auth.authController;
      expect(authController).toBeDefined();
      expect((auth as any)._authController).toBe(authController);

      // Second request uses cached controller
      const authController2 = auth.authController;
      expect(authController2).toBe(authController);

      // Load different controller
      const passkeyController = auth.passkeyController;
      expect(passkeyController).toBeDefined();
      expect((auth as any)._passkeyController).toBe(passkeyController);
    });

    it('should maintain component state across serverless invocations', async () => {
      const auth = new FirefunAuth(serverlessConfig);

      // Load components
      const authController1 = auth.authController;
      const middleware1 = auth.getAuthMiddleware();

      // Simulate multiple invocations
      const authController2 = auth.authController;
      const middleware2 = auth.getAuthMiddleware();

      // Should return same instances
      expect(authController1).toBe(authController2);
      expect(middleware1).toBe(middleware2);
    });
  });
});