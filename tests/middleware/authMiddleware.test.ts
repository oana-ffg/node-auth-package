/**
 * Test suite for AuthMiddleware
 *
 * Tests JWT verification middleware with various request scenarios including:
 * - Valid JWT tokens
 * - Invalid/expired JWT tokens
 * - Missing tokens
 * - Malformed tokens
 * - Error handling and response formatting
 */

import { AuthMiddleware, AuthMiddlewareConfig, AuthenticatedRequest } from '../../src/middleware/authMiddleware';
import { ErrorHandler, AppError } from '../../src/utils/errorHandler';
import { createMockRequest, createMockResponse, createMockNext, MockRequest, MockResponse } from '../mocks/express.mock';
import jwt from 'jsonwebtoken';
import { NextFunction } from 'express';

// Mock the JWT library
jest.mock('jsonwebtoken');
const mockJWT = jwt as jest.Mocked<typeof jwt>;

// Mock ErrorHandler - keep AppError real but mock the static methods
jest.mock('../../src/utils/errorHandler', () => ({
  ...jest.requireActual('../../src/utils/errorHandler'),
  ErrorHandler: {
    handleError: jest.fn(),
  },
}));
const mockErrorHandler = ErrorHandler as jest.Mocked<typeof ErrorHandler>;

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let config: AuthMiddlewareConfig;
  let req: MockRequest & AuthenticatedRequest;
  let res: MockResponse;
  let next: jest.MockedFunction<NextFunction>;

  const validSecret = 'test-jwt-secret';
  const validUserId = 'user_123';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Configure AuthMiddleware
    config = {
      jwtSecret: validSecret,
    };
    authMiddleware = new AuthMiddleware(config);

    // Create fresh mock objects for each test
    req = createMockRequest() as MockRequest & AuthenticatedRequest;
    res = createMockResponse();
    next = createMockNext();

    // Reset ErrorHandler mock implementation
    mockErrorHandler.handleError.mockImplementation((error, response, context) => {
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

  describe('verifyToken', () => {
    describe('Valid token scenarios', () => {
      it('should verify valid JWT token and call next()', () => {
        // Arrange
        const validToken = 'valid.jwt.token';
        const decodedPayload = { userId: validUserId };

        req.headers = {
          authorization: `Bearer ${validToken}`,
        };

        mockJWT.verify.mockReturnValue(decodedPayload as any);

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockJWT.verify).toHaveBeenCalledWith(validToken, validSecret);
        expect(req.userId).toBe(validUserId);
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
      });

      it('should handle token with additional payload data', () => {
        // Arrange
        const validToken = 'valid.jwt.token';
        const decodedPayload = {
          userId: validUserId,
          email: 'test@example.com',
          role: 'user',
          iat: Date.now() / 1000,
          exp: (Date.now() / 1000) + 3600
        };

        req.headers = {
          authorization: `Bearer ${validToken}`,
        };

        mockJWT.verify.mockReturnValue(decodedPayload as any);

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockJWT.verify).toHaveBeenCalledWith(validToken, validSecret);
        expect(req.userId).toBe(validUserId);
        expect(next).toHaveBeenCalledWith();
      });

      it('should handle token with complex userId format', () => {
        // Arrange
        const validToken = 'valid.jwt.token';
        const complexUserId = 'user_uuid_123-456-789-abc-def';
        const decodedPayload = { userId: complexUserId };

        req.headers = {
          authorization: `Bearer ${validToken}`,
        };

        mockJWT.verify.mockReturnValue(decodedPayload as any);

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(req.userId).toBe(complexUserId);
        expect(next).toHaveBeenCalledWith();
      });
    });

    describe('Missing token scenarios', () => {
      it('should reject request with no Authorization header', () => {
        // Arrange
        req.headers = {}; // No authorization header

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          expect.any(AppError),
          res,
          'auth middleware - missing token'
        );
        expect(next).not.toHaveBeenCalled();
        expect(mockJWT.verify).not.toHaveBeenCalled();

        // Verify the error details - check that ErrorHandler was called with correct parameters
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'No authentication token provided',
            statusCode: 401,
            details: {
              reason: 'Missing or malformed Authorization header',
              help: 'Include Authorization header with Bearer token format: "Bearer <token>"'
            }
          }),
          res,
          'auth middleware - missing token'
        );
      });

      it('should reject request with undefined Authorization header', () => {
        // Arrange
        req.headers = {
          authorization: undefined,
        };

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          expect.any(AppError),
          res,
          'auth middleware - missing token'
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should reject request with empty Authorization header', () => {
        // Arrange
        req.headers = {
          authorization: '',
        };

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          expect.any(AppError),
          res,
          'auth middleware - missing token'
        );
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Malformed token scenarios', () => {
      it('should reject request with malformed Authorization header (missing Bearer)', () => {
        // Arrange
        req.headers = {
          authorization: 'invalid.jwt.token', // Missing "Bearer " prefix
        };

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          expect.any(AppError),
          res,
          'auth middleware - missing token'
        );
        expect(next).not.toHaveBeenCalled();
        expect(mockJWT.verify).not.toHaveBeenCalled();
      });

      it('should reject request with wrong scheme (Basic instead of Bearer)', () => {
        // Arrange
        req.headers = {
          authorization: 'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
        };

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          expect.any(AppError),
          res,
          'auth middleware - missing token'
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should reject request with Bearer but no token', () => {
        // Arrange
        req.headers = {
          authorization: 'Bearer ', // Bearer with no token
        };

        const jwtError = new Error('Token empty');
        jwtError.name = 'JsonWebTokenError';
        mockJWT.verify.mockImplementation(() => {
          throw jwtError;
        });

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockJWT.verify).toHaveBeenCalledWith('', validSecret);
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          jwtError,
          res,
          'auth middleware - token verification'
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should handle Bearer with extra spaces', () => {
        // Arrange
        const validToken = 'valid.jwt.token';
        req.headers = {
          authorization: `Bearer  ${validToken}`, // Extra space
        };

        // Since split(' ')[1] on "Bearer  token" gives empty string, this should fail
        const jwtError = new Error('Token empty');
        jwtError.name = 'JsonWebTokenError';
        mockJWT.verify.mockImplementation(() => {
          throw jwtError;
        });

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockJWT.verify).toHaveBeenCalledWith('', validSecret); // Empty string due to extra space
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          jwtError,
          res,
          'auth middleware - token verification'
        );
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Invalid token scenarios', () => {
      it('should handle JWT verification error', () => {
        // Arrange
        const invalidToken = 'invalid.jwt.token';
        req.headers = {
          authorization: `Bearer ${invalidToken}`,
        };

        const jwtError = new Error('Invalid token signature');
        jwtError.name = 'JsonWebTokenError';
        mockJWT.verify.mockImplementation(() => {
          throw jwtError;
        });

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockJWT.verify).toHaveBeenCalledWith(invalidToken, validSecret);
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          jwtError,
          res,
          'auth middleware - token verification'
        );
        expect(next).not.toHaveBeenCalled();
        expect(req.userId).toBeUndefined();
      });

      it('should handle expired token error', () => {
        // Arrange
        const expiredToken = 'expired.jwt.token';
        req.headers = {
          authorization: `Bearer ${expiredToken}`,
        };

        const expiredError = new Error('Token expired');
        expiredError.name = 'TokenExpiredError';
        mockJWT.verify.mockImplementation(() => {
          throw expiredError;
        });

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          expiredError,
          res,
          'auth middleware - token verification'
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should handle malformed JWT token', () => {
        // Arrange
        const malformedToken = 'malformed.token';
        req.headers = {
          authorization: `Bearer ${malformedToken}`,
        };

        const malformedError = new Error('Invalid token format');
        malformedError.name = 'JsonWebTokenError';
        mockJWT.verify.mockImplementation(() => {
          throw malformedError;
        });

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          malformedError,
          res,
          'auth middleware - token verification'
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should handle token with invalid secret', () => {
        // Arrange
        const tokenWithWrongSecret = 'token.with.wrong.secret';
        req.headers = {
          authorization: `Bearer ${tokenWithWrongSecret}`,
        };

        const wrongSecretError = new Error('Invalid signature');
        wrongSecretError.name = 'JsonWebTokenError';
        mockJWT.verify.mockImplementation(() => {
          throw wrongSecretError;
        });

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          wrongSecretError,
          res,
          'auth middleware - token verification'
        );
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Payload validation scenarios', () => {
      it('should handle token with missing userId in payload', () => {
        // Arrange
        const validToken = 'token.without.userid';
        req.headers = {
          authorization: `Bearer ${validToken}`,
        };

        const payloadWithoutUserId = { email: 'test@example.com' }; // No userId
        mockJWT.verify.mockReturnValue(payloadWithoutUserId as any);

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(mockJWT.verify).toHaveBeenCalledWith(validToken, validSecret);
        expect(req.userId).toBeUndefined();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      });

      it('should handle token with null userId in payload', () => {
        // Arrange
        const validToken = 'token.with.null.userid';
        req.headers = {
          authorization: `Bearer ${validToken}`,
        };

        const payloadWithNullUserId = { userId: null };
        mockJWT.verify.mockReturnValue(payloadWithNullUserId as any);

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(req.userId).toBeUndefined();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      });

      it('should handle token with empty string userId', () => {
        // Arrange
        const validToken = 'token.with.empty.userid';
        req.headers = {
          authorization: `Bearer ${validToken}`,
        };

        const payloadWithEmptyUserId = { userId: '' };
        mockJWT.verify.mockReturnValue(payloadWithEmptyUserId as any);

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(req.userId).toBeUndefined();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Header case sensitivity', () => {
      it('should handle lowercase authorization header', () => {
        // Arrange
        const validToken = 'valid.jwt.token';
        req.headers = {
          authorization: `Bearer ${validToken}`, // lowercase
        };

        const decodedPayload = { userId: validUserId };
        mockJWT.verify.mockReturnValue(decodedPayload as any);

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        expect(req.userId).toBe(validUserId);
        expect(next).toHaveBeenCalledWith();
      });

      it('should handle uppercase Authorization header', () => {
        // Arrange
        const validToken = 'valid.jwt.token';
        req.headers = {
          Authorization: `Bearer ${validToken}`, // uppercase
        } as any;

        const decodedPayload = { userId: validUserId };
        mockJWT.verify.mockReturnValue(decodedPayload as any);

        // Act
        authMiddleware.verifyToken(req, res, next);

        // Assert
        // Express normalizes headers to lowercase, so this test ensures
        // our middleware works with the Express behavior
        expect(mockJWT.verify).not.toHaveBeenCalled();
        expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
          expect.any(AppError),
          res,
          'auth middleware - missing token'
        );
      });
    });
  });

  describe('AuthMiddleware constructor', () => {
    it('should initialize with provided config', () => {
      // Arrange & Act
      const testConfig: AuthMiddlewareConfig = {
        jwtSecret: 'test-secret-123',
      };
      const middleware = new AuthMiddleware(testConfig);

      // Assert
      expect(middleware).toBeInstanceOf(AuthMiddleware);
      expect(middleware.verifyToken).toBeInstanceOf(Function);
    });

    it('should handle different secret formats', () => {
      // Test with various secret formats
      const configs = [
        { jwtSecret: 'simple-secret' },
        { jwtSecret: 'complex-secret-with-numbers-123' },
        { jwtSecret: 'secret-with-special-chars-!@#$%' },
        { jwtSecret: 'very-long-secret-key-that-might-be-used-in-production-environments' },
      ];

      configs.forEach(config => {
        const middleware = new AuthMiddleware(config);
        expect(middleware).toBeInstanceOf(AuthMiddleware);
      });
    });
  });

  describe('createAuthMiddleware factory function', () => {
    it('should create middleware function from config', () => {
      // Arrange
      const { createAuthMiddleware } = require('../../src/middleware/authMiddleware');
      const config: AuthMiddlewareConfig = {
        jwtSecret: 'factory-secret',
      };

      // Act
      const middlewareFunction = createAuthMiddleware(config);

      // Assert
      expect(middlewareFunction).toBeInstanceOf(Function);
      expect(middlewareFunction.length).toBe(3); // req, res, next parameters
    });

    it('should create functional middleware that works correctly', () => {
      // Arrange
      const { createAuthMiddleware } = require('../../src/middleware/authMiddleware');
      const config: AuthMiddlewareConfig = {
        jwtSecret: validSecret,
      };
      const middlewareFunction = createAuthMiddleware(config);

      const validToken = 'valid.jwt.token';
      req.headers = {
        authorization: `Bearer ${validToken}`,
      };

      const decodedPayload = { userId: validUserId };
      mockJWT.verify.mockReturnValue(decodedPayload as any);

      // Act
      middlewareFunction(req, res, next);

      // Assert
      expect(req.userId).toBe(validUserId);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Error handling integration', () => {
    it('should properly integrate with ErrorHandler for missing tokens', () => {
      // Arrange
      req.headers = {};

      // Act
      authMiddleware.verifyToken(req, res, next);

      // Assert
      expect(mockErrorHandler.handleError).toHaveBeenCalledTimes(1);

      const [error, response, context] = mockErrorHandler.handleError.mock.calls[0];
      expect(error).toBeInstanceOf(AppError);
      expect(response).toBe(res);
      expect(context).toBe('auth middleware - missing token');
    });

    it('should properly integrate with ErrorHandler for JWT errors', () => {
      // Arrange
      const invalidToken = 'invalid.token';
      req.headers = {
        authorization: `Bearer ${invalidToken}`,
      };

      const jwtError = new Error('Token verification failed');
      mockJWT.verify.mockImplementation(() => {
        throw jwtError;
      });

      // Act
      authMiddleware.verifyToken(req, res, next);

      // Assert
      expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
        jwtError,
        res,
        'auth middleware - token verification'
      );
    });
  });

  describe('Request modification', () => {
    it('should not modify request if token verification fails', () => {
      // Arrange
      const originalUserId = req.userId;
      req.headers = {};

      // Act
      authMiddleware.verifyToken(req, res, next);

      // Assert
      expect(req.userId).toBe(originalUserId); // Should be unchanged (undefined)
    });

    it('should only modify userId property on request', () => {
      // Arrange
      const validToken = 'valid.jwt.token';
      const originalBody = { test: 'data' };
      const originalQuery = { search: 'test' };

      req.headers = {
        authorization: `Bearer ${validToken}`,
      };
      req.body = originalBody;
      req.query = originalQuery;

      const decodedPayload = { userId: validUserId, extra: 'data' };
      mockJWT.verify.mockReturnValue(decodedPayload as any);

      // Act
      authMiddleware.verifyToken(req, res, next);

      // Assert
      expect(req.userId).toBe(validUserId);
      expect(req.body).toBe(originalBody); // Unchanged
      expect(req.query).toBe(originalQuery); // Unchanged
      expect((req as any).extra).toBeUndefined(); // Extra payload data not added to req
    });
  });
});