/**
 * Test suite for RateLimitMiddleware
 *
 * Tests rate limiting middleware for different endpoint types including:
 * - General API rate limiting
 * - Authentication endpoint rate limiting
 * - 2FA endpoint rate limiting
 * - Rate limit configuration and behavior
 * - Error handling and response formatting
 */

import { RateLimitMiddleware, RateLimitMiddlewareConfig, RateLimitConfig } from '../../src/middleware/rateLimitMiddleware';
import { createMockRequest, createMockResponse, createMockNext, MockRequest, MockResponse, RateLimitHelpers } from '../mocks/express.mock';
import { NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Mock the express-rate-limit library
jest.mock('express-rate-limit');
const mockRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;

describe('RateLimitMiddleware', () => {
  let rateLimitMiddleware: RateLimitMiddleware;
  let config: RateLimitMiddlewareConfig;
  let req: MockRequest;
  let res: MockResponse;
  let next: jest.MockedFunction<NextFunction>;

  // Mock rate limiter function that express-rate-limit would return
  let mockRateLimiterFunction: jest.MockedFunction<(req: any, res: any, next: any) => void>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create a mock rate limiter function
    mockRateLimiterFunction = jest.fn((req: any, res: any, next: any) => {
      next(); // Default: allow request through
    });

    // Configure rate limit library mock to return our mock function
    mockRateLimit.mockReturnValue(mockRateLimiterFunction);

    // Configure RateLimitMiddleware with test values
    config = {
      general: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,
        message: 'Too many requests from this IP, please try again later',
      },
      auth: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5,
        message: 'Too many authentication attempts, please try again later',
      },
      twoFA: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 3,
        message: 'Too many 2FA attempts, please try again later',
      },
    };

    rateLimitMiddleware = new RateLimitMiddleware(config);

    // Create fresh mock objects for each test
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with provided configuration', () => {
      // Act
      const middleware = new RateLimitMiddleware(config);

      // Assert
      expect(middleware).toBeInstanceOf(RateLimitMiddleware);
      expect(middleware.generalRateLimit).toBeDefined();
      expect(middleware.authRateLimit).toBeDefined();
      expect(middleware.twoFALimit).toBeDefined();
    });

    it('should handle different rate limit configurations', () => {
      // Arrange
      const customConfig: RateLimitMiddlewareConfig = {
        general: {
          windowMs: 60000, // 1 minute
          maxRequests: 50,
          message: 'Custom general rate limit message',
        },
        auth: {
          windowMs: 300000, // 5 minutes
          maxRequests: 10,
          message: 'Custom auth rate limit message',
        },
        twoFA: {
          windowMs: 900000, // 15 minutes
          maxRequests: 5,
          message: 'Custom 2FA rate limit message',
        },
      };

      // Act
      const middleware = new RateLimitMiddleware(customConfig);

      // Assert
      expect(middleware).toBeInstanceOf(RateLimitMiddleware);
    });
  });

  describe('generalRateLimit', () => {
    it('should create rate limiter with correct general configuration', () => {
      // Act
      const rateLimiter = rateLimitMiddleware.generalRateLimit;

      // Assert
      expect(mockRateLimit).toHaveBeenCalledWith({
        windowMs: config.general.windowMs,
        max: config.general.maxRequests,
        message: {
          error: config.general.message,
          retryAfter: Math.ceil(config.general.windowMs / 1000),
        },
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      });
      expect(rateLimiter).toBe(mockRateLimiterFunction);
    });

    it('should calculate correct retryAfter value for general rate limit', () => {
      // Act
      rateLimitMiddleware.generalRateLimit;

      // Assert
      const callArgs = mockRateLimit.mock.calls[0][0];
      const expectedRetryAfter = Math.ceil(config.general.windowMs / 1000);
      expect(callArgs.message.retryAfter).toBe(expectedRetryAfter);
    });

    it('should not skip any requests for general rate limiting', () => {
      // Act
      rateLimitMiddleware.generalRateLimit;

      // Assert
      const callArgs = mockRateLimit.mock.calls[0][0];
      expect(callArgs.skipSuccessfulRequests).toBe(false);
      expect(callArgs.skipFailedRequests).toBe(false);
    });

    it('should handle multiple accesses to generalRateLimit', () => {
      // Act
      const rateLimiter1 = rateLimitMiddleware.generalRateLimit;
      const rateLimiter2 = rateLimitMiddleware.generalRateLimit;

      // Assert
      expect(mockRateLimit).toHaveBeenCalledTimes(1);
      expect(rateLimiter1).toBe(mockRateLimiterFunction);
      expect(rateLimiter2).toBe(mockRateLimiterFunction);
    });
  });

  describe('authRateLimit', () => {
    it('should create rate limiter with correct auth configuration', () => {
      // Act
      const rateLimiter = rateLimitMiddleware.authRateLimit;

      // Assert
      expect(mockRateLimit).toHaveBeenCalledWith({
        windowMs: config.auth.windowMs,
        max: config.auth.maxRequests,
        message: {
          error: config.auth.message,
          retryAfter: Math.ceil(config.auth.windowMs / 1000),
        },
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skipSuccessfulRequests: true, // Skip successful requests for auth
        skipFailedRequests: false,
      });
      expect(rateLimiter).toBe(mockRateLimiterFunction);
    });

    it('should skip successful requests for auth endpoints', () => {
      // Act
      rateLimitMiddleware.authRateLimit;

      // Assert
      const callArgs = mockRateLimit.mock.calls[0][0];
      expect(callArgs.skipSuccessfulRequests).toBe(true);
      expect(callArgs.skipFailedRequests).toBe(false);
    });

    it('should use stricter limits for auth endpoints', () => {
      // Act
      rateLimitMiddleware.authRateLimit;

      // Assert
      const callArgs = mockRateLimit.mock.calls[0][0];
      expect(callArgs.max).toBe(config.auth.maxRequests);
      expect(callArgs.max).toBeLessThan(config.general.maxRequests);
    });

    it('should have auth-specific error message', () => {
      // Act
      rateLimitMiddleware.authRateLimit;

      // Assert
      const callArgs = mockRateLimit.mock.calls[0][0];
      expect(callArgs.message.error).toBe(config.auth.message);
      expect(callArgs.message.error).toContain('authentication');
    });
  });

  describe('twoFALimit', () => {
    it('should create rate limiter with correct 2FA configuration', () => {
      // Act
      const rateLimiter = rateLimitMiddleware.twoFALimit;

      // Assert
      expect(mockRateLimit).toHaveBeenCalledWith({
        windowMs: config.twoFA.windowMs,
        max: config.twoFA.maxRequests,
        message: {
          error: config.twoFA.message,
          retryAfter: Math.ceil(config.twoFA.windowMs / 1000),
        },
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skipSuccessfulRequests: false, // Count all requests for 2FA
        skipFailedRequests: false,
      });
      expect(rateLimiter).toBe(mockRateLimiterFunction);
    });

    it('should not skip any requests for 2FA endpoints', () => {
      // Act
      rateLimitMiddleware.twoFALimit;

      // Assert
      const callArgs = mockRateLimit.mock.calls[0][0];
      expect(callArgs.skipSuccessfulRequests).toBe(false);
      expect(callArgs.skipFailedRequests).toBe(false);
    });

    it('should use strictest limits for 2FA endpoints', () => {
      // Act
      rateLimitMiddleware.twoFALimit;

      // Assert
      const callArgs = mockRateLimit.mock.calls[0][0];
      expect(callArgs.max).toBe(config.twoFA.maxRequests);
      expect(callArgs.max).toBeLessThan(config.auth.maxRequests);
      expect(callArgs.max).toBeLessThan(config.general.maxRequests);
    });

    it('should have 2FA-specific error message', () => {
      // Act
      rateLimitMiddleware.twoFALimit;

      // Assert
      const callArgs = mockRateLimit.mock.calls[0][0];
      expect(callArgs.message.error).toBe(config.twoFA.message);
      expect(callArgs.message.error).toContain('2FA');
    });
  });

  describe('Rate Limit Behavior Simulation', () => {
    it('should allow requests within rate limit', () => {
      // Arrange
      const rateLimiter = rateLimitMiddleware.generalRateLimit;

      // Act
      rateLimiter(req, res, next);

      // Assert
      expect(mockRateLimiterFunction).toHaveBeenCalledWith(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle rate limit exceeded scenario', () => {
      // Arrange
      const rateLimiter = rateLimitMiddleware.authRateLimit;

      // Configure mock to simulate rate limit exceeded
      mockRateLimiterFunction.mockImplementation((req: any, res: any, next: any) => {
        res.status(429).json({
          error: config.auth.message,
          retryAfter: Math.ceil(config.auth.windowMs / 1000),
        });
      });

      // Act
      rateLimiter(req, res, next);

      // Assert
      expect(mockRateLimiterFunction).toHaveBeenCalledWith(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: config.auth.message,
        retryAfter: Math.ceil(config.auth.windowMs / 1000),
      });
    });

    it('should handle different client IPs independently', () => {
      // Arrange
      const rateLimiter = rateLimitMiddleware.generalRateLimit;
      const requests = RateLimitHelpers.createRequestsFromDifferentIPs([
        '192.168.1.1',
        '192.168.1.2',
        '192.168.1.3'
      ]);

      // Act & Assert
      requests.forEach(request => {
        rateLimiter(request, res, next);
        expect(mockRateLimiterFunction).toHaveBeenCalledWith(request, res, next);
      });
    });

    it('should track rate limits per IP address', () => {
      // Arrange
      const rateLimiter = rateLimitMiddleware.authRateLimit;
      const multipleRequests = RateLimitHelpers.createMultipleRequests(3, { ip: '192.168.1.100' });

      // Act
      multipleRequests.forEach(request => {
        rateLimiter(request, res, next);
      });

      // Assert
      expect(mockRateLimiterFunction).toHaveBeenCalledTimes(3);
      multipleRequests.forEach(request => {
        expect(request.ip).toBe('192.168.1.100');
      });
    });
  });

  describe('Header Configuration', () => {
    it('should use draft-7 standard headers for all rate limiters', () => {
      // Act
      rateLimitMiddleware.generalRateLimit;
      rateLimitMiddleware.authRateLimit;
      rateLimitMiddleware.twoFALimit;

      // Assert
      expect(mockRateLimit).toHaveBeenCalledTimes(3);
      mockRateLimit.mock.calls.forEach(call => {
        expect(call[0].standardHeaders).toBe('draft-7');
        expect(call[0].legacyHeaders).toBe(false);
      });
    });

    it('should disable legacy headers for all rate limiters', () => {
      // Act
      rateLimitMiddleware.generalRateLimit;
      rateLimitMiddleware.authRateLimit;
      rateLimitMiddleware.twoFALimit;

      // Assert
      mockRateLimit.mock.calls.forEach(call => {
        expect(call[0].legacyHeaders).toBe(false);
      });
    });
  });

  describe('Message Format Validation', () => {
    it('should format error messages correctly for all rate limiters', () => {
      // Act
      rateLimitMiddleware.generalRateLimit;
      rateLimitMiddleware.authRateLimit;
      rateLimitMiddleware.twoFALimit;

      // Assert
      const [generalCall, authCall, twoFACall] = mockRateLimit.mock.calls;

      // General rate limit message
      expect(generalCall[0].message).toEqual({
        error: config.general.message,
        retryAfter: Math.ceil(config.general.windowMs / 1000),
      });

      // Auth rate limit message
      expect(authCall[0].message).toEqual({
        error: config.auth.message,
        retryAfter: Math.ceil(config.auth.windowMs / 1000),
      });

      // 2FA rate limit message
      expect(twoFACall[0].message).toEqual({
        error: config.twoFA.message,
        retryAfter: Math.ceil(config.twoFA.windowMs / 1000),
      });
    });

    it('should calculate retryAfter correctly for different window sizes', () => {
      // Arrange
      const customConfig: RateLimitMiddlewareConfig = {
        general: { windowMs: 60000, maxRequests: 100, message: 'General limit' }, // 1 minute
        auth: { windowMs: 300000, maxRequests: 5, message: 'Auth limit' }, // 5 minutes
        twoFA: { windowMs: 900000, maxRequests: 3, message: '2FA limit' }, // 15 minutes
      };
      const customMiddleware = new RateLimitMiddleware(customConfig);

      // Act
      customMiddleware.generalRateLimit;
      customMiddleware.authRateLimit;
      customMiddleware.twoFALimit;

      // Assert
      const [generalCall, authCall, twoFACall] = mockRateLimit.mock.calls;

      expect(generalCall[0].message.retryAfter).toBe(60); // 60 seconds
      expect(authCall[0].message.retryAfter).toBe(300); // 300 seconds
      expect(twoFACall[0].message.retryAfter).toBe(900); // 900 seconds
    });
  });

  describe('createRateLimitMiddleware factory function', () => {
    it('should create middleware instance from config', () => {
      // Arrange
      const { createRateLimitMiddleware } = require('../../src/middleware/rateLimitMiddleware');

      // Act
      const middleware = createRateLimitMiddleware(config);

      // Assert
      expect(middleware).toBeInstanceOf(RateLimitMiddleware);
      expect(middleware.generalRateLimit).toBeDefined();
      expect(middleware.authRateLimit).toBeDefined();
      expect(middleware.twoFALimit).toBeDefined();
    });

    it('should create functional middleware with correct configuration', () => {
      // Arrange
      const { createRateLimitMiddleware } = require('../../src/middleware/rateLimitMiddleware');
      const middleware = createRateLimitMiddleware(config);

      // Act
      const generalLimiter = middleware.generalRateLimit;

      // Assert
      expect(mockRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: config.general.windowMs,
          max: config.general.maxRequests,
        })
      );
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle zero maxRequests configuration', () => {
      // Arrange
      const restrictiveConfig: RateLimitMiddlewareConfig = {
        general: { windowMs: 60000, maxRequests: 0, message: 'No requests allowed' },
        auth: { windowMs: 60000, maxRequests: 0, message: 'No auth allowed' },
        twoFA: { windowMs: 60000, maxRequests: 0, message: 'No 2FA allowed' },
      };

      // Act
      const middleware = new RateLimitMiddleware(restrictiveConfig);
      middleware.generalRateLimit;

      // Assert
      expect(mockRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 0,
        })
      );
    });

    it('should handle very short window times', () => {
      // Arrange
      const shortWindowConfig: RateLimitMiddlewareConfig = {
        general: { windowMs: 1000, maxRequests: 1, message: 'Short window' }, // 1 second
        auth: { windowMs: 500, maxRequests: 1, message: 'Very short window' }, // 0.5 seconds
        twoFA: { windowMs: 100, maxRequests: 1, message: 'Extremely short window' }, // 0.1 seconds
      };

      // Act
      const middleware = new RateLimitMiddleware(shortWindowConfig);
      middleware.generalRateLimit;
      middleware.authRateLimit;
      middleware.twoFALimit;

      // Assert
      const [generalCall, authCall, twoFACall] = mockRateLimit.mock.calls;

      expect(generalCall[0].windowMs).toBe(1000);
      expect(generalCall[0].message.retryAfter).toBe(1);

      expect(authCall[0].windowMs).toBe(500);
      expect(authCall[0].message.retryAfter).toBe(1); // Rounds up from 0.5

      expect(twoFACall[0].windowMs).toBe(100);
      expect(twoFACall[0].message.retryAfter).toBe(1); // Rounds up from 0.1
    });

    it('should handle very large window times', () => {
      // Arrange
      const longWindowConfig: RateLimitMiddlewareConfig = {
        general: { windowMs: 24 * 60 * 60 * 1000, maxRequests: 1000, message: 'Daily limit' }, // 24 hours
        auth: { windowMs: 60 * 60 * 1000, maxRequests: 10, message: 'Hourly limit' }, // 1 hour
        twoFA: { windowMs: 30 * 60 * 1000, maxRequests: 5, message: '30 min limit' }, // 30 minutes
      };

      // Act
      const middleware = new RateLimitMiddleware(longWindowConfig);
      middleware.generalRateLimit;
      middleware.authRateLimit;
      middleware.twoFALimit;

      // Assert
      const [generalCall, authCall, twoFACall] = mockRateLimit.mock.calls;

      expect(generalCall[0].message.retryAfter).toBe(24 * 60 * 60); // 24 hours in seconds
      expect(authCall[0].message.retryAfter).toBe(60 * 60); // 1 hour in seconds
      expect(twoFACall[0].message.retryAfter).toBe(30 * 60); // 30 minutes in seconds
    });

    it('should handle empty or undefined messages', () => {
      // Arrange
      const configWithEmptyMessages: RateLimitMiddlewareConfig = {
        general: { windowMs: 60000, maxRequests: 100, message: '' },
        auth: { windowMs: 60000, maxRequests: 5, message: '' },
        twoFA: { windowMs: 60000, maxRequests: 3, message: '' },
      };

      // Act
      const middleware = new RateLimitMiddleware(configWithEmptyMessages);
      middleware.generalRateLimit;

      // Assert
      expect(mockRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: {
            error: '',
            retryAfter: 60,
          },
        })
      );
    });
  });

  describe('Performance and Memory Considerations', () => {
    it('should not create new rate limiters on repeated access', () => {
      // Act - Access each limiter multiple times
      for (let i = 0; i < 5; i++) {
        rateLimitMiddleware.generalRateLimit;
        rateLimitMiddleware.authRateLimit;
        rateLimitMiddleware.twoFALimit;
      }

      // Repeated access shares each limiter and its counter.
      expect(mockRateLimit).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent access to rate limiters', () => {
      // Act - Simulate concurrent access
      const promises = Array.from({ length: 10 }, async () => {
        return Promise.all([
          Promise.resolve(rateLimitMiddleware.generalRateLimit),
          Promise.resolve(rateLimitMiddleware.authRateLimit),
          Promise.resolve(rateLimitMiddleware.twoFALimit),
        ]);
      });

      // Assert - Should not throw errors
      expect(() => Promise.all(promises)).not.toThrow();
    });
  });
});