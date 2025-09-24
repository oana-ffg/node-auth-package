/**
 * Mock implementation for jsonwebtoken library
 * Used for testing JWT token generation and verification functionality
 */

export interface JWTMockConfig {
  signResult?: string;
  verifyResult?: any;
  decodeResult?: any;
  signError?: Error;
  verifyError?: Error;
  decodeError?: Error;
}

export interface JWTPayload {
  userId?: string;
  email?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  sub?: string;
  [key: string]: any;
}

export interface JWTSignOptions {
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  subject?: string;
  algorithm?: string;
  keyid?: string;
  noTimestamp?: boolean;
  header?: object;
}

export interface JWTVerifyOptions {
  algorithms?: string[];
  audience?: string | string[];
  complete?: boolean;
  issuer?: string | string[];
  ignoreExpiration?: boolean;
  ignoreNotBefore?: boolean;
  subject?: string;
  clockTolerance?: number;
  maxAge?: string | number;
  clockTimestamp?: number;
}

export class JWTMock {
  private config: JWTMockConfig;
  private static instance: JWTMock;
  private signCallCount = 0;
  private verifyCallCount = 0;
  private decodeCallCount = 0;

  constructor(config: JWTMockConfig = {}) {
    this.config = {
      signResult: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2MzQwNzI0MDAsImV4cCI6MTYzNDA3NjAwMH0.test-signature',
      verifyResult: {
        userId: 'test-user-id',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      decodeResult: {
        userId: 'test-user-id',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      ...config
    };
  }

  static getInstance(config?: JWTMockConfig): JWTMock {
    if (!JWTMock.instance) {
      JWTMock.instance = new JWTMock(config);
    }
    if (config) {
      JWTMock.instance.updateConfig(config);
    }
    return JWTMock.instance;
  }

  updateConfig(config: Partial<JWTMockConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.config = {
      signResult: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2MzQwNzI0MDAsImV4cCI6MTYzNDA3NjAwMH0.test-signature',
      verifyResult: {
        userId: 'test-user-id',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      decodeResult: {
        userId: 'test-user-id',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      }
    };
    this.signCallCount = 0;
    this.verifyCallCount = 0;
    this.decodeCallCount = 0;
  }

  getCallCounts(): { sign: number; verify: number; decode: number } {
    return {
      sign: this.signCallCount,
      verify: this.verifyCallCount,
      decode: this.decodeCallCount
    };
  }

  // Mock the sign function
  sign = jest.fn().mockImplementation((payload: string | object | Buffer, secretOrPrivateKey: string, options?: JWTSignOptions): string => {
    this.signCallCount++;

    if (this.config.signError) {
      throw this.config.signError;
    }

    // Simulate different signing scenarios
    if (secretOrPrivateKey === 'INVALID_SECRET') {
      throw new Error('Invalid secret key');
    }

    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      throw new Error('Invalid payload');
    }

    // Generate a deterministic token for testing
    const now = Math.floor(Date.now() / 1000);
    const exp = options?.expiresIn
      ? typeof options.expiresIn === 'string'
        ? now + this.parseTimeString(options.expiresIn)
        : now + options.expiresIn
      : now + 3600;

    const mockPayload = {
      ...(typeof payload === 'object' ? payload : { data: payload }),
      iat: now,
      exp,
      ...(options?.issuer && { iss: options.issuer }),
      ...(options?.audience && { aud: options.audience }),
      ...(options?.subject && { sub: options.subject })
    };

    // Create a deterministic token based on payload
    const header = { alg: options?.algorithm || 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(mockPayload)).toString('base64url');
    const signature = 'test-signature-' + Buffer.from(secretOrPrivateKey).toString('base64url').slice(0, 10);

    return this.config.signResult || `${encodedHeader}.${encodedPayload}.${signature}`;
  });

  // Mock the verify function
  verify = jest.fn().mockImplementation((token: string, secretOrPublicKey: string, options?: JWTVerifyOptions): any => {
    this.verifyCallCount++;

    if (this.config.verifyError) {
      throw this.config.verifyError;
    }

    // Simulate different verification scenarios
    if (token === 'INVALID_TOKEN') {
      throw new Error('Invalid token');
    }

    if (token === 'EXPIRED_TOKEN') {
      const error = new Error('jwt expired') as any;
      error.name = 'TokenExpiredError';
      error.expiredAt = new Date();
      throw error;
    }

    if (token === 'MALFORMED_TOKEN') {
      const error = new Error('jwt malformed') as any;
      error.name = 'JsonWebTokenError';
      throw error;
    }

    if (secretOrPublicKey === 'WRONG_SECRET') {
      const error = new Error('invalid signature') as any;
      error.name = 'JsonWebTokenError';
      throw error;
    }

    // Parse the token to extract payload if it's a real JWT format
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

        // Check expiration if not ignored
        if (!options?.ignoreExpiration && payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          const error = new Error('jwt expired') as any;
          error.name = 'TokenExpiredError';
          error.expiredAt = new Date(payload.exp * 1000);
          throw error;
        }

        // Check audience if specified
        if (options?.audience && payload.aud !== options.audience) {
          const error = new Error('jwt audience invalid') as any;
          error.name = 'JsonWebTokenError';
          throw error;
        }

        // Check issuer if specified
        if (options?.issuer && payload.iss !== options.issuer) {
          const error = new Error('jwt issuer invalid') as any;
          error.name = 'JsonWebTokenError';
          throw error;
        }

        return options?.complete
          ? { header: JSON.parse(Buffer.from(parts[0], 'base64url').toString()), payload, signature: parts[2] }
          : payload;
      }
    } catch (e) {
      // Fall through to default behavior
    }

    return options?.complete
      ? {
          header: { alg: 'HS256', typ: 'JWT' },
          payload: this.config.verifyResult,
          signature: 'test-signature'
        }
      : this.config.verifyResult;
  });

  // Mock the decode function
  decode = jest.fn().mockImplementation((token: string, options?: { complete?: boolean; json?: boolean }): any => {
    this.decodeCallCount++;

    if (this.config.decodeError) {
      throw this.config.decodeError;
    }

    if (token === 'INVALID_TOKEN') {
      return null;
    }

    if (token === 'MALFORMED_TOKEN') {
      return null;
    }

    // Try to decode if it's a real JWT format
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

        return options?.complete
          ? { header, payload, signature: parts[2] }
          : payload;
      }
    } catch (e) {
      // Fall through to default behavior
    }

    return options?.complete
      ? {
          header: { alg: 'HS256', typ: 'JWT' },
          payload: this.config.decodeResult,
          signature: 'test-signature'
        }
      : this.config.decodeResult;
  });

  // Helper method to parse time strings like '1h', '30m', '7d'
  private parseTimeString(timeStr: string): number {
    const units: { [key: string]: number } = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400,
      'w': 604800,
      'y': 31536000
    };

    const match = timeStr.match(/^(\d+)([smhdwy])$/);
    if (!match) {
      throw new Error('Invalid time format');
    }

    const [, amount, unit] = match;
    return parseInt(amount, 10) * units[unit];
  }
}

// Create the default mock instance
const jwtMock = JWTMock.getInstance();

// Export individual functions to match jsonwebtoken's export pattern
export const sign = jwtMock.sign;
export const verify = jwtMock.verify;
export const decode = jwtMock.decode;

// Export default
export default jwtMock;

// Mock the module
jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: jwtMock,
  sign: jwtMock.sign,
  verify: jwtMock.verify,
  decode: jwtMock.decode,
}));

// Helper functions for test setup
export const setupJWTMock = (config?: JWTMockConfig): JWTMock => {
  const mock = JWTMock.getInstance(config);
  mock.reset();
  if (config) {
    mock.updateConfig(config);
  }
  return mock;
};

// Common test scenarios
export const jwtTestScenarios = {
  validSigning: {
    signResult: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2MzQwNzI0MDAsImV4cCI6MTYzNDA3NjAwMH0.test-signature'
  },
  signingError: {
    signError: new Error('Token signing failed')
  },
  validVerification: {
    verifyResult: {
      userId: 'test-user-id',
      email: 'test@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    }
  },
  expiredToken: {
    verifyError: (() => {
      const error = new Error('jwt expired') as any;
      error.name = 'TokenExpiredError';
      error.expiredAt = new Date();
      return error;
    })()
  },
  invalidToken: {
    verifyError: (() => {
      const error = new Error('jwt malformed') as any;
      error.name = 'JsonWebTokenError';
      return error;
    })()
  },
  invalidSignature: {
    verifyError: (() => {
      const error = new Error('invalid signature') as any;
      error.name = 'JsonWebTokenError';
      return error;
    })()
  }
};

// Export the mock instance for direct manipulation in tests
export { jwtMock };