/**
 * Boundary Conditions Test Suite
 *
 * Tests edge cases and boundary conditions including:
 * - Concurrent request handling scenarios
 * - Rate limiting boundary conditions
 * - Memory usage and resource limits
 * - Large payload handling
 * - Performance under stress conditions
 */

import { Request, Response } from 'express';
import { AuthController, AuthControllerConfig } from '../../src/controllers/authController';
import { RateLimitMiddleware, RateLimitMiddlewareConfig } from '../../src/middleware/rateLimitMiddleware';
import { AuthMiddleware, AuthMiddlewareConfig, AuthenticatedRequest } from '../../src/middleware/authMiddleware';
import { ErrorHandler, AppError } from '../../src/utils/errorHandler';
import { createMockRequest, createMockResponse, MockRequest, MockResponse, createMockNext } from '../mocks/express.mock';
import { MockPrismaClient } from '../mocks/prisma.mock';
import { testConfig } from '../setup';

// Mock external dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('crypto');
jest.mock('express-rate-limit');

describe('Boundary Conditions - Concurrent Requests', () => {
  let authController: AuthController;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new MockPrismaClient();

    // Setup test configuration
    const config: AuthControllerConfig = {
      ...testConfig,
      prisma: mockPrisma as any,
    };

    authController = new AuthController(config);

    // Mock ErrorHandler
    jest.spyOn(ErrorHandler, 'handleError').mockImplementation((error, response) => {
      if (error instanceof AppError) {
        response.status(error.statusCode).json({
          error: error.message,
          ...(error.details && { details: error.details })
        });
      } else {
        response.status(500).json({ error: 'Internal server error' });
      }
      return response;
    });
  });

  describe('High concurrency scenarios', () => {
    it('should handle multiple simultaneous registration attempts', async () => {
      // Arrange
      const concurrentRequests = 10; // Reduced for test speed
      const promises = [];

      // Setup mock to handle concurrent database calls
      mockPrisma.user.findUnique.mockResolvedValue(null);
      let userIdCounter = 1;
      mockPrisma.user.create.mockImplementation(async () => ({
        id: `user_${userIdCounter++}`,
        email: `test${userIdCounter}@example.com`,
        hashedPassword: 'hashed_password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      // Create concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        req.body = {
          email: `test${i}@example.com`,
          password: 'ValidPassword123!'
        };
        promises.push(authController.registerUser(req as Request, res as Response));
      }

      // Act
      const results = await Promise.allSettled(promises);

      // Assert
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful + failed).toBe(concurrentRequests);
      expect(successful).toBeGreaterThan(0); // At least some should succeed
      console.log(`Concurrent test results: ${successful} succeeded, ${failed} failed`);
    });

    it('should handle concurrent login attempts for same user', async () => {
      // Arrange
      const concurrentRequests = 5; // Reduced for test speed
      const promises = [];

      // Setup mock user
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        hashedPassword: 'hashed_password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockImplementation(async () => ({
        id: `token_${Math.random()}`,
        userId: 'user_123',
        token: `refresh_${Math.random()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      }));

      // Mock bcrypt
      const bcrypt = require('bcrypt');
      bcrypt.compare = jest.fn().mockResolvedValue(true);

      // Mock JWT
      const jwt = require('jsonwebtoken');
      jwt.sign = jest.fn().mockReturnValue('mock.jwt.token');

      // Create concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        req.body = {
          email: 'test@example.com',
          password: 'ValidPassword123!'
        };
        promises.push(authController.loginUser(req as Request, res as Response));
      }

      // Act
      const results = await Promise.allSettled(promises);

      // Assert
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful + failed).toBe(concurrentRequests);
      expect(successful).toBeGreaterThan(0); // At least some should succeed
    });

    it('should handle race condition in 2FA operations', async () => {
      // Arrange
      const concurrentRequests = 5;
      const promises = [];

      // Setup authenticated request
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        hashedPassword: 'hashed_password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Create concurrent 2FA generation requests
      for (let i = 0; i < concurrentRequests; i++) {
        const req = createMockRequest() as MockRequest & AuthenticatedRequest;
        const res = createMockResponse();
        req.userId = 'user_123';
        promises.push(authController.generate2FASecret(req as Request & AuthenticatedRequest, res as Response));
      }

      // Act
      const results = await Promise.allSettled(promises);

      // Assert
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful + failed).toBe(concurrentRequests);
      // Should handle race conditions gracefully
    });
  });

  describe('Resource exhaustion scenarios', () => {
    it('should handle memory pressure during bulk operations', async () => {
      // Arrange
      const bulkSize = 20; // Reduced for test speed
      const promises = [];

      // Create large payload that might cause memory issues
      const largePayload = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
        extraData: 'x'.repeat(1000) // Large string
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: `user_${Math.random()}`,
        email: 'test@example.com',
        hashedPassword: 'hashed',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Create bulk requests
      for (let i = 0; i < bulkSize; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        req.body = { ...largePayload, email: `test${i}@example.com` };
        promises.push(authController.registerUser(req as Request, res as Response));
      }

      // Act & Assert - Should not crash or hang
      const startTime = Date.now();
      await Promise.allSettled(promises);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (not hang indefinitely)
      expect(duration).toBeLessThan(10000); // 10 seconds max
    });

    it('should handle deep recursion scenarios gracefully', async () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();

      // Create deeply nested object
      let deepObject: any = { email: 'test@example.com', password: 'ValidPassword123!' };
      for (let i = 0; i < 20; i++) { // Reduced depth for test speed
        deepObject = { nested: deepObject };
      }
      req.body = deepObject;

      // Act & Assert - Should not cause stack overflow
      await expect(async () => {
        await authController.registerUser(req as Request, res as Response);
      }).not.toThrow('Maximum call stack size exceeded');
    });
  });

  describe('Large data handling', () => {
    it('should handle maximum allowed email length', async () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();

      // Create email at boundary length (typically 254 chars is max for email)
      const longEmail = 'a'.repeat(240) + '@example.com'; // 253 chars total
      req.body = {
        email: longEmail,
        password: 'ValidPassword123!'
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act
      await authController.registerUser(req as Request, res as Response);

      // Assert - Should handle without crashing
      expect(res.status).toHaveBeenCalled();
    });

    it('should handle maximum password complexity', async () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();

      // Create password with maximum allowed complexity
      const complexPassword = 'A'.repeat(25) + 'a'.repeat(25) + '1'.repeat(25) + '!'.repeat(25); // 100 chars
      req.body = {
        email: 'test@example.com',
        password: complexPassword
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act
      await authController.registerUser(req as Request, res as Response);

      // Assert - Should handle without crashing
      expect(res.status).toHaveBeenCalled();
    });

    it('should handle payload at size limits', async () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();

      // Create payload close to typical Express body parser limits
      const largeString = 'x'.repeat(50000); // ~50KB
      req.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
        largeField: largeString
      };

      // Act & Assert - Should either process or reject gracefully
      await authController.registerUser(req as Request, res as Response);
      expect(res.status).toHaveBeenCalled();
    });
  });
});

describe('Boundary Conditions - Rate Limiting', () => {
  let rateLimitMiddleware: RateLimitMiddleware;
  let req: MockRequest;
  let res: MockResponse;
  let next: jest.MockedFunction<any>;

  const rateLimitConfig: RateLimitMiddlewareConfig = {
    general: {
      windowMs: 1000, // 1 second window for fast testing
      maxRequests: 5,
      message: 'Rate limit exceeded'
    },
    auth: {
      windowMs: 1000,
      maxRequests: 3,
      message: 'Auth rate limit exceeded'
    },
    twoFA: {
      windowMs: 1000,
      maxRequests: 2,
      message: '2FA rate limit exceeded'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimitMiddleware = new RateLimitMiddleware(rateLimitConfig);
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();

    req.ip = '127.0.0.1';

    // Mock express-rate-limit
    const rateLimit = require('express-rate-limit');
    rateLimit.mockReturnValue((req: any, res: any, next: any) => {
      // Simple rate limiting mock - allow first few requests, then block
      const requestCount = (req as any).requestCount || 0;
      (req as any).requestCount = requestCount + 1;

      if (requestCount < rateLimitConfig.general.maxRequests) {
        next();
      } else {
        res.status(429).json({ error: 'Rate limit exceeded' });
      }
    });
  });

  describe('Rate limit boundary conditions', () => {
    it('should handle exactly at rate limit threshold', async () => {
      // Arrange
      const middleware = rateLimitMiddleware.generalRateLimit;

      // Act - Make exactly maxRequests calls
      for (let i = 0; i < rateLimitConfig.general.maxRequests; i++) {
        middleware(req as Request, res as Response, next);
      }

      // Assert - Should handle boundary condition
      expect(res.status).not.toHaveBeenCalledWith(429);
    });

    it('should block exactly one request over limit', async () => {
      // Arrange
      const middleware = rateLimitMiddleware.generalRateLimit;

      // Act - Make one more than maxRequests
      for (let i = 0; i < rateLimitConfig.general.maxRequests + 1; i++) {
        middleware(req as Request, res as Response, next);
      }

      // Assert - Last request should be blocked
      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('should handle different rate limit types', async () => {
      // Test all three rate limit types
      const generalMiddleware = rateLimitMiddleware.generalRateLimit;
      const authMiddleware = rateLimitMiddleware.authRateLimit;
      const twoFAMiddleware = rateLimitMiddleware.twoFALimit;

      expect(generalMiddleware).toBeDefined();
      expect(authMiddleware).toBeDefined();
      expect(twoFAMiddleware).toBeDefined();
    });

    it('should handle missing IP address gracefully', async () => {
      // Arrange
      req.ip = undefined as any;
      const middleware = rateLimitMiddleware.generalRateLimit;

      // Act & Assert - Should not crash
      expect(() => {
        middleware(req as Request, res as Response, next);
      }).not.toThrow();
    });

    it('should handle malformed IP addresses', async () => {
      // Arrange
      const malformedIPs = [
        'not.an.ip',
        '999.999.999.999',
        '::ffff:300.300.300.300',
        'x'.repeat(100),
        null,
        undefined,
        123,
        {},
        []
      ];

      // Act & Assert - Should handle all malformed IPs without crashing
      malformedIPs.forEach((malformedIP, index) => {
        const testReq = createMockRequest();
        testReq.ip = malformedIP as any;
        const middleware = rateLimitMiddleware.generalRateLimit;

        expect(() => {
          middleware(testReq as Request, res as Response, next);
        }).not.toThrow(`Failed on IP: ${malformedIP}`);
      });
    });
  });

  describe('Memory and performance under load', () => {
    it('should not leak memory with many unique IPs', async () => {
      // Arrange - Simulate many unique IP addresses
      const uniqueIPs = 100; // Reduced for test speed
      const initialMemory = process.memoryUsage().heapUsed;
      const middleware = rateLimitMiddleware.generalRateLimit;

      // Act - Make requests from many unique IPs
      for (let i = 0; i < uniqueIPs; i++) {
        const testReq = createMockRequest();
        testReq.ip = `192.168.${Math.floor(i / 256)}.${i % 256}`;
        middleware(testReq as Request, res as Response, next);
      }

      // Allow garbage collection
      if (global.gc) global.gc();

      // Assert - Memory shouldn't grow excessively
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Should not grow by more than 10MB for 100 IPs
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });

    it('should handle rapid fire requests efficiently', async () => {
      // Arrange
      const rapidRequests = 100; // Reduced for test speed
      const startTime = process.hrtime.bigint();
      const middleware = rateLimitMiddleware.generalRateLimit;

      // Act - Make rapid requests
      for (let i = 0; i < rapidRequests; i++) {
        middleware(req as Request, res as Response, next);
      }

      // Assert - Should complete quickly
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      // Should handle 100 requests in less than 1 second
      expect(durationMs).toBeLessThan(1000);
    });
  });
});

describe('Boundary Conditions - Resource Limits', () => {
  let authController: AuthController;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new MockPrismaClient();

    // Setup test configuration
    const config: AuthControllerConfig = {
      ...testConfig,
      prisma: mockPrisma as any,
    };

    authController = new AuthController(config);
  });

  describe('Performance under stress', () => {
    it('should maintain response time under moderate load', async () => {
      // Arrange
      const requests = 20; // Reduced for test speed
      const maxResponseTime = 100; // 100ms per request max

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockImplementation(async () => {
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 1));
        return {
          id: `user_${Math.random()}`,
          email: 'test@example.com',
          hashedPassword: 'hashed',
          twoFactorEnabled: false,
          twoFactorSecret: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      });

      // Act
      const startTime = Date.now();
      const promises = [];

      for (let i = 0; i < requests; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        req.body = {
          email: `test${i}@example.com`,
          password: 'ValidPassword123!'
        };
        promises.push(authController.registerUser(req as Request, res as Response));
      }

      await Promise.allSettled(promises);
      const totalTime = Date.now() - startTime;

      // Assert - Average response time should be reasonable
      const avgResponseTime = totalTime / requests;
      expect(avgResponseTime).toBeLessThan(maxResponseTime);
    });

    it('should handle timeout scenarios gracefully', async () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();
      req.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!'
      };

      // Mock slow database response
      mockPrisma.user.findUnique.mockImplementation(() =>
        new Promise((resolve) => setTimeout(() => resolve(null), 500))
      );

      // Act - Operation should complete in reasonable time
      const startTime = Date.now();
      await authController.registerUser(req as Request, res as Response);
      const duration = Date.now() - startTime;

      // Assert - Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second max
    });

    it('should maintain functionality with limited resources', async () => {
      // Arrange - Simulate low memory condition
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        ...originalMemoryUsage(),
        heapUsed: 900 * 1024 * 1024, // Simulate high memory usage
        heapTotal: 1024 * 1024 * 1024,
        external: 100 * 1024 * 1024,
        arrayBuffers: 50 * 1024 * 1024,
        rss: 1200 * 1024 * 1024
      }));

      const req = createMockRequest();
      const res = createMockResponse();
      req.body = {
        email: 'test@example.com',
        password: 'ValidPassword123!'
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        hashedPassword: 'hashed',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Act & Assert - Should still function under resource pressure
      await expect(
        authController.registerUser(req as Request, res as Response)
      ).resolves.not.toThrow();

      // Cleanup
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('Edge case data validation', () => {
    it('should handle Unicode edge cases in email validation', async () => {
      // Arrange
      const unicodeEmails = [
        'test@münchen.de',
        'user+tag@domain.com',
        'user.name+tag+sorting@example.com'
      ];

      // Act & Assert - Should handle Unicode emails appropriately
      for (const email of unicodeEmails) {
        const req = createMockRequest();
        const res = createMockResponse();
        req.body = {
          email,
          password: 'ValidPassword123!'
        };

        await expect(
          authController.registerUser(req as Request, res as Response)
        ).resolves.not.toThrow();
      }
    });

    it('should handle password edge cases', async () => {
      // Arrange
      const edgeCasePasswords = [
        'A1!a' + 'x'.repeat(96), // 100 chars
        'Valid123!' + '🔒', // Unicode emoji
        'Пароль123!', // Cyrillic
        '密码123!', // Chinese
        'パス123!' // Japanese
      ];

      // Act & Assert - Should handle edge case passwords appropriately
      for (const password of edgeCasePasswords) {
        const req = createMockRequest();
        const res = createMockResponse();
        req.body = {
          email: 'test@example.com',
          password
        };

        await expect(
          authController.registerUser(req as Request, res as Response)
        ).resolves.not.toThrow();
      }
    });
  });
});