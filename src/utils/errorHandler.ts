import { Response } from 'express';

export interface ErrorResponse {
  error: string;
  message?: string;
  details?: Record<string, any>;
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ErrorHandler {
  /**
   * Handles different types of errors and returns appropriate responses
   */
  static handleError(error: unknown, res: Response, context?: string): Response {
    console.error(`Error in ${context || 'unknown context'}:`, error);

    // Handle known AppError instances
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.details && { details: error.details })
      });
    }

    // Handle Prisma errors
    if (this.isPrismaError(error)) {
      return this.handlePrismaError(error, res);
    }

    // Handle JWT errors
    if (this.isJWTError(error)) {
      return this.handleJWTError(error, res);
    }

    // Handle JSON parsing errors
    if (this.isJSONError(error)) {
      return res.status(400).json({
        error: 'Invalid JSON format',
        message: 'The request body contains malformed JSON'
      });
    }

    // Handle validation errors (additional to Zod)
    if (this.isValidationError(error)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: this.getErrorMessage(error)
      });
    }

    // Default fallback for unexpected errors
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }

  /**
   * Handle Prisma database errors
   */
  private static handlePrismaError(error: any, res: Response): Response {
    const code = error.code;

    switch (code) {
      case 'P2002':
        return res.status(409).json({
          error: 'Duplicate entry',
          message: 'A record with this information already exists'
        });

      case 'P2025':
        return res.status(404).json({
          error: 'Record not found',
          message: 'The requested record does not exist'
        });

      case 'P2003':
        return res.status(400).json({
          error: 'Foreign key constraint failed',
          message: 'Referenced record does not exist'
        });

      case 'P2014':
        return res.status(400).json({
          error: 'Invalid relation',
          message: 'The requested change violates a required relation'
        });

      case 'P1008':
        return res.status(503).json({
          error: 'Database timeout',
          message: 'Database operation timed out. Please try again.'
        });

      case 'P1001':
        return res.status(503).json({
          error: 'Database connection failed',
          message: 'Cannot connect to database. Please try again later.'
        });

      default:
        console.error('Unhandled Prisma error:', error);
        return res.status(500).json({
          error: 'Database error',
          message: 'A database error occurred. Please try again later.'
        });
    }
  }

  /**
   * Handle JWT-related errors
   */
  private static handleJWTError(error: any, res: Response): Response {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('expired')) {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.'
      });
    }

    if (message.includes('malformed') || message.includes('invalid')) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Authentication token is invalid. Please log in again.'
      });
    }

    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid or missing authentication token'
    });
  }

  /**
   * Create standardized error responses for common scenarios
   */
  static unauthorized(message: string = 'Unauthorized access'): AppError {
    return new AppError(message, 401);
  }

  static forbidden(message: string = 'Access forbidden'): AppError {
    return new AppError(message, 403);
  }

  static notFound(message: string = 'Resource not found'): AppError {
    return new AppError(message, 404);
  }

  static badRequest(message: string = 'Bad request', details?: Record<string, any>): AppError {
    return new AppError(message, 400, true, details);
  }

  static conflict(message: string = 'Resource conflict'): AppError {
    return new AppError(message, 409);
  }

  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(message, 500);
  }

  /**
   * Type guards for different error types
   */
  private static isPrismaError(error: any): boolean {
    return error?.name === 'PrismaClientKnownRequestError' ||
           error?.name === 'PrismaClientUnknownRequestError' ||
           error?.name === 'PrismaClientValidationError' ||
           error?.name === 'PrismaClientInitializationError';
  }

  private static isJWTError(error: any): boolean {
    return error?.name === 'JsonWebTokenError' ||
           error?.name === 'TokenExpiredError' ||
           error?.name === 'NotBeforeError';
  }

  private static isJSONError(error: any): boolean {
    return error?.name === 'SyntaxError' &&
           error?.message?.includes('JSON');
  }

  private static isValidationError(error: any): boolean {
    return error?.name === 'ValidationError' ||
           (error?.message && typeof error.message === 'string' &&
            error.message.toLowerCase().includes('validation'));
  }

  private static getErrorMessage(error: any): string {
    if (error?.message) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error occurred';
  }
}

/**
 * Async wrapper for route handlers that automatically catches and handles errors
 */
export const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      ErrorHandler.handleError(error, res, req.route?.path || 'unknown route');
    });
  };
};

/**
 * Express error middleware - use as last middleware
 */
export const errorMiddleware = (error: any, req: any, res: any, next: any) => {
  ErrorHandler.handleError(error, res, req.route?.path || 'middleware');
};