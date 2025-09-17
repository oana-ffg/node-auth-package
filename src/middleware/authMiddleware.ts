import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Request to include the decoded user
export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export interface AuthMiddlewareConfig {
  jwtSecret: string;
}

export class AuthMiddleware {
  private jwtSecret: string;

  constructor(config: AuthMiddlewareConfig) {
    this.jwtSecret = config.jwtSecret;
  }

  /**
   * Middleware to verify JWT token from the Authorization header.
   * If valid, attaches decoded user info to req.userId and calls next().
   * If invalid or missing, sends a 401 Unauthorized response.
   */
  public verifyToken = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      req.userId = decoded.userId;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// Create a factory function for backward compatibility
export const createAuthMiddleware = (config: AuthMiddlewareConfig) => {
  const middleware = new AuthMiddleware(config);
  return middleware.verifyToken;
};