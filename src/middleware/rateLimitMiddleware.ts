import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

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
  private generalLimiter?: RateLimitRequestHandler;
  private authLimiter?: RateLimitRequestHandler;
  private twoFALimiter?: RateLimitRequestHandler;
  private config: RateLimitMiddlewareConfig;

  constructor(config: RateLimitMiddlewareConfig) {
    this.config = config;
  }

  private createLimiter(config: RateLimitConfig, skipSuccessfulRequests: boolean = false): RateLimitRequestHandler {
    return rateLimit({
      windowMs: config.windowMs,
      max: config.maxRequests,
      message: {
        error: config.message,
        retryAfter: Math.ceil(config.windowMs / 1000),
      },
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests,
      skipFailedRequests: false,
    });
  }

  public get generalRateLimit() {
    return this.generalLimiter ??= this.createLimiter(this.config.general);
  }

  // Count failed authentication attempts without penalizing successful logins.
  public get authRateLimit() {
    return this.authLimiter ??= this.createLimiter(this.config.auth, true);
  }

  public get twoFALimit() {
    return this.twoFALimiter ??= this.createLimiter(this.config.twoFA);
  }

}

// Create factory functions for backward compatibility
export const createRateLimitMiddleware = (config: RateLimitMiddlewareConfig) => {
  return new RateLimitMiddleware(config);
};