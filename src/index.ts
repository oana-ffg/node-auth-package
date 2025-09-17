import { PrismaClient } from '@prisma/client';
import { Router } from 'express';

// Controllers
import { AuthController } from './controllers/authController';
import { PasskeyController } from './controllers/passkeyController';

// Middleware
import { AuthMiddleware, createAuthMiddleware } from './middleware/authMiddleware';
import { RateLimitMiddleware, createRateLimitMiddleware } from './middleware/rateLimitMiddleware';

// Services
import { CleanupService } from './services/cleanupService';
import { JobScheduler } from './jobs/scheduler';

// Utils and Schemas
import { EncryptionUtil, initializeEncryption } from './utils/encryption';
import { AuthSchemas } from './schemas/authSchemas';

// Types
import type {
  AuthConfig,
  RateLimitConfig,
  ValidationConfig,
  SchedulerConfig
} from './types';

export interface FirefunAuthConfig {
  // Core configuration
  appName: string;

  // JWT configuration
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };

  // Security configuration
  security: {
    bcryptRounds: number;
  };

  // Encryption configuration
  encryption: {
    algorithm?: string;
    keyLength?: number;
    ivLength?: number;
    saltLength?: number;
    pbkdf2Iterations?: number;
    keys: {
      v1: string;
      v2?: string;
    };
    currentVersion: string;
  };

  // WebAuthn configuration
  webauthn: {
    rpName: string;
    rpId: string;
    origin: string;
    timeout?: number;
    userVerification?: 'required' | 'preferred' | 'discouraged';
  };

  // Rate limiting configuration
  rateLimiting: {
    general: RateLimitConfig;
    auth: RateLimitConfig;
    twoFA: RateLimitConfig;
  };

  // Validation configuration
  validation?: ValidationConfig;

  // Scheduler configuration
  scheduler?: SchedulerConfig;

  // Prisma client
  prisma: PrismaClient;
}

export class FirefunAuth {
  private config: AuthConfig;
  private prisma: PrismaClient;

  // Core components
  private authController: AuthController;
  private passkeyController: PasskeyController;
  private authMiddleware: AuthMiddleware;
  private rateLimitMiddleware: RateLimitMiddleware;
  private cleanupService: CleanupService;
  private jobScheduler?: JobScheduler;
  private schemas: AuthSchemas;

  constructor(config: FirefunAuthConfig) {
    this.prisma = config.prisma;

    // Set defaults and create full config
    this.config = {
      appName: config.appName,
      jwt: config.jwt,
      security: config.security,
      encryption: {
        algorithm: config.encryption.algorithm || 'aes-256-gcm',
        keyLength: config.encryption.keyLength || 32,
        ivLength: config.encryption.ivLength || 16,
        saltLength: config.encryption.saltLength || 32,
        pbkdf2Iterations: config.encryption.pbkdf2Iterations || 100000,
        keys: config.encryption.keys,
        currentVersion: config.encryption.currentVersion,
      },
      webauthn: {
        rpName: config.webauthn.rpName,
        rpId: config.webauthn.rpId,
        origin: config.webauthn.origin,
        timeout: config.webauthn.timeout || 60000,
        userVerification: config.webauthn.userVerification || 'preferred',
      },
    };

    // Initialize encryption with config
    initializeEncryption(this.config.encryption);

    // Initialize components
    this.authController = new AuthController({
      ...this.config,
      prisma: this.prisma,
    });

    this.passkeyController = new PasskeyController({
      ...this.config,
      prisma: this.prisma,
    });

    this.authMiddleware = new AuthMiddleware({
      jwtSecret: this.config.jwt.secret,
    });

    this.rateLimitMiddleware = new RateLimitMiddleware(config.rateLimiting);

    this.cleanupService = new CleanupService(this.prisma);

    if (config.scheduler) {
      this.jobScheduler = new JobScheduler(this.cleanupService, config.scheduler);
    }

    const validationConfig = config.validation || {
      passwordMinLength: 8,
      requireUppercase: true,
      requireNumber: true,
      requireSpecialChar: true,
    };

    this.schemas = new AuthSchemas(validationConfig);
  }

  /**
   * Create auth routes router
   */
  public createAuthRoutes(): Router {
    const router = Router();

    // Apply auth rate limiting to sensitive endpoints
    router.use('/login', this.rateLimitMiddleware.authRateLimit);
    router.use('/register', this.rateLimitMiddleware.authRateLimit);
    router.use('/refresh', this.rateLimitMiddleware.authRateLimit);

    // Apply 2FA rate limiting to 2FA endpoints
    router.use('/2fa/*', this.rateLimitMiddleware.twoFALimit);

    // Auth routes
    router.post('/register', this.authController.registerUser);
    router.post('/login', this.authController.loginUser);
    router.post('/login/2fa', this.authController.loginWith2FA);
    router.post('/refresh', this.authController.refreshTokenHandler);

    // 2FA routes (protected)
    router.post('/2fa/generate', this.authMiddleware.verifyToken, this.authController.generate2FASecret);
    router.post('/2fa/confirm', this.authMiddleware.verifyToken, this.authController.confirm2FA);
    router.post('/2fa/reset', this.authMiddleware.verifyToken, this.authController.reset2FA);
    router.post('/2fa/disable', this.authMiddleware.verifyToken, this.authController.disable2FA);

    // Account management (protected)
    router.delete('/account', this.authMiddleware.verifyToken, this.authController.deleteAccount);

    return router;
  }

  /**
   * Create passkey routes router
   */
  public createPasskeyRoutes(): Router {
    const router = Router();

    // Public routes
    router.post('/authenticate/start', this.passkeyController.startPasskeyAuthentication);
    router.post('/authenticate/complete', this.passkeyController.completePasskeyAuthentication);

    // Protected routes
    router.post('/register/start', this.authMiddleware.verifyToken, this.passkeyController.startPasskeyRegistration);
    router.post('/register/complete', this.authMiddleware.verifyToken, this.passkeyController.completePasskeyRegistration);
    router.get('/list', this.authMiddleware.verifyToken, this.passkeyController.listPasskeys);
    router.delete('/:id', this.authMiddleware.verifyToken, this.passkeyController.deletePasskey);
    router.patch('/:id/rename', this.authMiddleware.verifyToken, this.passkeyController.renamePasskey);

    return router;
  }

  /**
   * Get the auth middleware for protecting routes
   */
  public getAuthMiddleware() {
    return this.authMiddleware.verifyToken;
  }

  /**
   * Get rate limiting middleware
   */
  public getRateLimitMiddleware() {
    return {
      general: this.rateLimitMiddleware.generalRateLimit,
      auth: this.rateLimitMiddleware.authRateLimit,
      twoFA: this.rateLimitMiddleware.twoFALimit,
    };
  }

  /**
   * Start scheduled cleanup jobs
   */
  public startScheduler(): void {
    if (this.jobScheduler) {
      this.jobScheduler.startScheduledJobs();
    } else {
      console.warn('⚠️ Scheduler not configured. Pass scheduler config to FirefunAuth constructor to enable scheduled cleanup.');
    }
  }

  /**
   * Stop scheduled cleanup jobs
   */
  public stopScheduler(): void {
    if (this.jobScheduler) {
      this.jobScheduler.stopScheduledJobs();
    }
  }

  /**
   * Manually trigger cleanup
   */
  public async performCleanup() {
    return this.cleanupService.performAllCleanups();
  }

  /**
   * Get validation schemas
   */
  public getSchemas() {
    return this.schemas;
  }
}

// Export types and utilities
export type * from './types';
export type { AuthenticatedRequest } from './middleware/authMiddleware';
export { serializeEncryptedData, deserializeEncryptedData } from './utils/encryption';

// Export individual components for advanced usage
export {
  AuthController,
  PasskeyController,
  AuthMiddleware,
  RateLimitMiddleware,
  CleanupService,
  JobScheduler,
  EncryptionUtil,
  AuthSchemas,
  createAuthMiddleware,
  createRateLimitMiddleware,
};