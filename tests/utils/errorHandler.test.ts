/**
 * Tests for error handling utilities
 * Covers error handling, response formatting, and different error types
 */

import { Response } from 'express';
import {
  ErrorHandler,
  AppError,
  ErrorResponse,
  asyncHandler,
  errorMiddleware
} from '../../src/utils/errorHandler';

describe('AppError', () => {
  it('should create error with default values', () => {
    const error = new AppError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.details).toBeUndefined();
    expect(error.name).toBe('AppError');
  });

  it('should create error with custom values', () => {
    const details = { field: 'email', code: 'INVALID' };
    const error = new AppError('Validation error', 400, true, details);

    expect(error.message).toBe('Validation error');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
    expect(error.details).toEqual(details);
  });

  it('should create error with non-operational flag', () => {
    const error = new AppError('System error', 500, false);

    expect(error.isOperational).toBe(false);
  });

  it('should capture stack trace', () => {
    const error = new AppError('Test error');

    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });
});

describe('ErrorHandler static methods', () => {
  describe('error creation methods', () => {
    it('should create unauthorized error', () => {
      const error = ErrorHandler.unauthorized();

      expect(error.message).toBe('Unauthorized access');
      expect(error.statusCode).toBe(401);
    });

    it('should create unauthorized error with custom message', () => {
      const error = ErrorHandler.unauthorized('Token expired');

      expect(error.message).toBe('Token expired');
      expect(error.statusCode).toBe(401);
    });

    it('should create forbidden error', () => {
      const error = ErrorHandler.forbidden();

      expect(error.message).toBe('Access forbidden');
      expect(error.statusCode).toBe(403);
    });

    it('should create not found error', () => {
      const error = ErrorHandler.notFound();

      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create bad request error', () => {
      const error = ErrorHandler.badRequest();

      expect(error.message).toBe('Bad request');
      expect(error.statusCode).toBe(400);
    });

    it('should create bad request error with details', () => {
      const details = { field: 'email', error: 'Invalid format' };
      const error = ErrorHandler.badRequest('Validation failed', details);

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual(details);
    });

    it('should create conflict error', () => {
      const error = ErrorHandler.conflict();

      expect(error.message).toBe('Resource conflict');
      expect(error.statusCode).toBe(409);
    });

    it('should create internal error', () => {
      const error = ErrorHandler.internal();

      expect(error.message).toBe('Internal server error');
      expect(error.statusCode).toBe(500);
    });
  });
});

describe('ErrorHandler.handleError', () => {
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnThis();
    mockResponse = {
      status: mockStatus,
      json: mockJson
    };

    // Mock console.error to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AppError handling', () => {
    it('should handle AppError with details', () => {
      const details = { field: 'email', code: 'INVALID' };
      const error = new AppError('Validation error', 400, true, details);

      ErrorHandler.handleError(error, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Validation error',
        details
      });
    });

    it('should handle AppError without details', () => {
      const error = new AppError('Simple error', 404);

      ErrorHandler.handleError(error, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Simple error'
      });
    });
  });

  describe('Prisma error handling', () => {
    it('should handle P2002 (unique constraint) error', () => {
      const prismaError = {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        message: 'Unique constraint failed'
      };

      ErrorHandler.handleError(prismaError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Duplicate entry',
        message: 'A record with this information already exists'
      });
    });

    it('should handle P2025 (record not found) error', () => {
      const prismaError = {
        name: 'PrismaClientKnownRequestError',
        code: 'P2025',
        message: 'Record not found'
      };

      ErrorHandler.handleError(prismaError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Record not found',
        message: 'The requested record does not exist'
      });
    });

    it('should handle P2003 (foreign key constraint) error', () => {
      const prismaError = {
        name: 'PrismaClientKnownRequestError',
        code: 'P2003',
        message: 'Foreign key constraint failed'
      };

      ErrorHandler.handleError(prismaError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Foreign key constraint failed',
        message: 'Referenced record does not exist'
      });
    });

    it('should handle P2014 (relation violation) error', () => {
      const prismaError = {
        name: 'PrismaClientKnownRequestError',
        code: 'P2014',
        message: 'Relation violation'
      };

      ErrorHandler.handleError(prismaError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid relation',
        message: 'The requested change violates a required relation'
      });
    });

    it('should handle P1008 (database timeout) error', () => {
      const prismaError = {
        name: 'PrismaClientKnownRequestError',
        code: 'P1008',
        message: 'Database timeout'
      };

      ErrorHandler.handleError(prismaError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(503);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Database timeout',
        message: 'Database operation timed out. Please try again.'
      });
    });

    it('should handle P1001 (connection failed) error', () => {
      const prismaError = {
        name: 'PrismaClientKnownRequestError',
        code: 'P1001',
        message: 'Connection failed'
      };

      ErrorHandler.handleError(prismaError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(503);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Database connection failed',
        message: 'Cannot connect to database. Please try again later.'
      });
    });

    it('should handle unknown Prisma error', () => {
      const prismaError = {
        name: 'PrismaClientKnownRequestError',
        code: 'P9999',
        message: 'Unknown Prisma error'
      };

      ErrorHandler.handleError(prismaError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Database error',
        message: 'A database error occurred. Please try again later.'
      });
    });

    it('should handle different Prisma error types', () => {
      const errorTypes = [
        'PrismaClientKnownRequestError',
        'PrismaClientUnknownRequestError',
        'PrismaClientValidationError',
        'PrismaClientInitializationError'
      ];

      errorTypes.forEach(errorType => {
        const prismaError = {
          name: errorType,
          code: 'P9999',
          message: 'Test error'
        };

        ErrorHandler.handleError(prismaError, mockResponse as Response);
        expect(mockStatus).toHaveBeenCalledWith(500);
      });
    });
  });

  describe('JWT error handling', () => {
    it('should handle expired token error', () => {
      const jwtError = {
        name: 'TokenExpiredError',
        message: 'jwt expired'
      };

      ErrorHandler.handleError(jwtError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.'
      });
    });

    it('should handle malformed token error', () => {
      const jwtError = {
        name: 'JsonWebTokenError',
        message: 'jwt malformed'
      };

      ErrorHandler.handleError(jwtError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Authentication token is invalid. Please log in again.'
      });
    });

    it('should handle invalid token error', () => {
      const jwtError = {
        name: 'JsonWebTokenError',
        message: 'invalid token'
      };

      ErrorHandler.handleError(jwtError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Authentication token is invalid. Please log in again.'
      });
    });

    it('should handle generic JWT error', () => {
      const jwtError = {
        name: 'JsonWebTokenError',
        message: 'some other jwt error'
      };

      ErrorHandler.handleError(jwtError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'Invalid or missing authentication token'
      });
    });

    it('should handle NotBeforeError', () => {
      const jwtError = {
        name: 'NotBeforeError',
        message: 'jwt not active'
      };

      ErrorHandler.handleError(jwtError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'Invalid or missing authentication token'
      });
    });
  });

  describe('JSON error handling', () => {
    it('should handle JSON syntax error', () => {
      const jsonError = {
        name: 'SyntaxError',
        message: 'Unexpected token in JSON at position 0'
      };

      ErrorHandler.handleError(jsonError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Invalid JSON format',
        message: 'The request body contains malformed JSON'
      });
    });

    it('should not handle non-JSON syntax errors', () => {
      const syntaxError = {
        name: 'SyntaxError',
        message: 'Unexpected token'
      };

      ErrorHandler.handleError(syntaxError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });

  describe('validation error handling', () => {
    it('should handle ValidationError by name', () => {
      const validationError = {
        name: 'ValidationError',
        message: 'Field validation failed'
      };

      ErrorHandler.handleError(validationError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Validation failed',
        message: 'Field validation failed'
      });
    });

    it('should handle validation error by message content', () => {
      const validationError = {
        name: 'SomeError',
        message: 'validation failed for this field'
      };

      ErrorHandler.handleError(validationError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Validation failed',
        message: 'validation failed for this field'
      });
    });

    it('should handle error with string message', () => {
      const stringError = 'Simple string error';

      ErrorHandler.handleError(stringError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });

  describe('unknown error handling', () => {
    it('should handle unknown error object', () => {
      const unknownError = {
        someProperty: 'some value'
      };

      ErrorHandler.handleError(unknownError, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });

    it('should handle null error', () => {
      ErrorHandler.handleError(null, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });

    it('should handle undefined error', () => {
      ErrorHandler.handleError(undefined, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again later.'
      });
    });
  });

  describe('context logging', () => {
    it('should log error with context', () => {
      const error = new Error('Test error');
      const consoleSpy = jest.spyOn(console, 'error');

      ErrorHandler.handleError(error, mockResponse as Response, 'test-context');

      expect(consoleSpy).toHaveBeenCalledWith('Error in test-context:', error);
    });

    it('should log error with unknown context when no context provided', () => {
      const error = new Error('Test error');
      const consoleSpy = jest.spyOn(console, 'error');

      ErrorHandler.handleError(error, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalledWith('Error in unknown context:', error);
    });
  });
});

describe('asyncHandler', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();

    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should handle successful async function', async () => {
    const successfulHandler = async (req: any, res: any) => {
      res.json({ success: true });
    };

    const wrappedHandler = asyncHandler(successfulHandler);
    await wrappedHandler(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should catch and handle async errors', async () => {
    const error = new AppError('Async error', 400);
    const failingHandler = async () => {
      throw error;
    };

    const wrappedHandler = asyncHandler(failingHandler);
    await wrappedHandler(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Async error'
    });
  });

  it('should handle sync function that returns promise', async () => {
    const syncHandler = () => {
      return Promise.resolve('sync result');
    };

    const wrappedHandler = asyncHandler(syncHandler);
    await wrappedHandler(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle sync function that returns promise and throws', async () => {
    const syncHandler = () => {
      return Promise.reject(new Error('Sync promise error'));
    };

    const wrappedHandler = asyncHandler(syncHandler);
    await wrappedHandler(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again later.'
    });
  });

  it('should include route path in error context when available', async () => {
    const error = new Error('Route error');
    const failingHandler = async () => {
      throw error;
    };

    mockReq.route = { path: '/test/route' };
    const consoleSpy = jest.spyOn(console, 'error');

    const wrappedHandler = asyncHandler(failingHandler);
    await wrappedHandler(mockReq, mockRes, mockNext);

    expect(consoleSpy).toHaveBeenCalledWith('Error in /test/route:', error);
  });

  it('should use unknown route when no route path available', async () => {
    const error = new Error('Route error');
    const failingHandler = async () => {
      throw error;
    };

    const consoleSpy = jest.spyOn(console, 'error');

    const wrappedHandler = asyncHandler(failingHandler);
    await wrappedHandler(mockReq, mockRes, mockNext);

    expect(consoleSpy).toHaveBeenCalledWith('Error in unknown route:', error);
  });
});

describe('errorMiddleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();

    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should handle errors in middleware', () => {
    const error = new AppError('Middleware error', 403);

    errorMiddleware(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Middleware error'
    });
  });

  it('should include route path in error context when available', () => {
    const error = new Error('Middleware error');
    mockReq.route = { path: '/middleware/route' };
    const consoleSpy = jest.spyOn(console, 'error');

    errorMiddleware(error, mockReq, mockRes, mockNext);

    expect(consoleSpy).toHaveBeenCalledWith('Error in /middleware/route:', error);
  });

  it('should use middleware context when no route path available', () => {
    const error = new Error('Middleware error');
    const consoleSpy = jest.spyOn(console, 'error');

    errorMiddleware(error, mockReq, mockRes, mockNext);

    expect(consoleSpy).toHaveBeenCalledWith('Error in middleware:', error);
  });
});