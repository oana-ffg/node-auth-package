export interface AuthConfig {
  appName: string;
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  security: {
    bcryptRounds: number;
  };
  encryption: {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    saltLength: number;
    pbkdf2Iterations: number;
    keys: {
      v1: string;
      v2?: string;
    };
    currentVersion: string;
    serverless?: boolean;
  };
  webauthn: {
    rpName: string;
    rpId: string;
    origin: string;
    timeout: number;
    userVerification: 'required' | 'preferred' | 'discouraged';
  };
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message: string;
}

export interface ValidationConfig {
  passwordMinLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
}

export interface SchedulerConfig {
  schedule: string;
  timezone: string;
}