import rateLimit from 'express-rate-limit';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message: string;
}

export interface RateLimitMiddlewareConfig {
  general: RateLimitConfig;
  auth: RateLimitConfig;
  twoFA: RateLimitConfig;
}

export class RateLimitMiddleware {
  private config: RateLimitMiddlewareConfig;

  constructor(config: RateLimitMiddlewareConfig) {
    this.config = config;
  }

  /**
   * General rate limiter for all API endpoints
   * Applies a moderate rate limit to prevent general API abuse
   */
  public get generalRateLimit() {
    return rateLimit({
      windowMs: this.config.general.windowMs,
      max: this.config.general.maxRequests,
      message: {
        error: this.config.general.message,
        retryAfter: Math.ceil(this.config.general.windowMs / 1000),
      },
      standardHeaders: 'draft-7', // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      // Skip successful requests when counting towards the limit
      skipSuccessfulRequests: false,
      // Skip failed requests when counting towards the limit
      skipFailedRequests: false,
    });
  }

  /**
   * Strict rate limiter for authentication endpoints (login, register)
   * Prevents brute force attacks on authentication
   */
  public get authRateLimit() {
    return rateLimit({
      windowMs: this.config.auth.windowMs,
      max: this.config.auth.maxRequests,
      message: {
        error: this.config.auth.message,
        retryAfter: Math.ceil(this.config.auth.windowMs / 1000),
      },
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // Only count failed requests for auth endpoints to prevent lockout on successful logins
      skipSuccessfulRequests: true,
      skipFailedRequests: false,
    });
  }

  /**
   * Very strict rate limiter for 2FA operations
   * Prevents abuse of two-factor authentication endpoints
   */
  public get twoFALimit() {
    return rateLimit({
      windowMs: this.config.twoFA.windowMs,
      max: this.config.twoFA.maxRequests,
      message: {
        error: this.config.twoFA.message,
        retryAfter: Math.ceil(this.config.twoFA.windowMs / 1000),
      },
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // Count all requests for 2FA operations as they are sensitive
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
    });
  }
}

// Create factory functions for backward compatibility
export const createRateLimitMiddleware = (config: RateLimitMiddlewareConfig) => {
  return new RateLimitMiddleware(config);
};