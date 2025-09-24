/**
 * Mock implementation for speakeasy library
 * Used for testing TOTP (Time-based One-time Password) functionality
 */

export interface SpeakeasyMockConfig {
  generateSecretResult?: {
    base32: string;
    otpauth_url: string;
  };
  verifyResult?: boolean;
  generateSecretError?: Error;
  verifyError?: Error;
}

export class SpeakeasyMock {
  private config: SpeakeasyMockConfig;
  private static instance: SpeakeasyMock;

  constructor(config: SpeakeasyMockConfig = {}) {
    this.config = {
      generateSecretResult: {
        base32: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/Test%20App:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Test%20App'
      },
      verifyResult: true,
      ...config
    };
  }

  static getInstance(config?: SpeakeasyMockConfig): SpeakeasyMock {
    if (!SpeakeasyMock.instance) {
      SpeakeasyMock.instance = new SpeakeasyMock(config);
    }
    if (config) {
      SpeakeasyMock.instance.updateConfig(config);
    }
    return SpeakeasyMock.instance;
  }

  updateConfig(config: Partial<SpeakeasyMockConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.config = {
      generateSecretResult: {
        base32: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/Test%20App:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Test%20App'
      },
      verifyResult: true
    };
  }

  // Mock the generateSecret function
  generateSecret = jest.fn().mockImplementation((options: any = {}) => {
    if (this.config.generateSecretError) {
      throw this.config.generateSecretError;
    }

    const result = {
      ...this.config.generateSecretResult,
      otpauth_url: options.issuer && options.label
        ? `otpauth://totp/${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.label)}?secret=${this.config.generateSecretResult?.base32}&issuer=${encodeURIComponent(options.issuer)}`
        : this.config.generateSecretResult?.otpauth_url
    };

    return result;
  });

  // Mock the verify function
  verify = jest.fn().mockImplementation((options: any) => {
    if (this.config.verifyError) {
      throw this.config.verifyError;
    }

    // Simulate different verification scenarios based on token
    if (options.token === '000000') {
      return false; // Invalid token
    }
    if (options.token === '999999') {
      return false; // Expired token
    }
    if (options.token === '123456') {
      return true; // Valid token
    }

    return this.config.verifyResult;
  });

  // Mock the totp object with verify and generate methods
  totp = {
    verify: jest.fn().mockImplementation((options: any) => {
      if (this.config.verifyError) {
        throw this.config.verifyError;
      }

      // Simulate different verification scenarios based on token
      if (options.token === '000000') {
        return false; // Invalid token
      }
      if (options.token === '999999') {
        return false; // Expired token
      }
      if (options.token === '123456') {
        return true; // Valid token
      }

      return this.config.verifyResult;
    }),
    generate: jest.fn().mockImplementation((options: any) => {
      if (options.secret === 'INVALID_SECRET') {
        throw new Error('Invalid secret');
      }
      return '123456'; // Always return a predictable token for testing
    })
  };

  // Mock the otpauthURL function
  otpauthURL = jest.fn().mockImplementation((options: any) => {
    const { secret, label, issuer, algorithm = 'sha1', digits = 6, period = 30 } = options;
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=${algorithm}&digits=${digits}&period=${period}`;
  });

  // Mock the time function
  time = jest.fn().mockImplementation((options: any = {}) => {
    const now = options.time ? Math.floor(options.time / 1000) : Math.floor(Date.now() / 1000);
    const step = options.step || 30;
    return Math.floor(now / step);
  });
}

// Create the default mock instance
const speakeasyMock = SpeakeasyMock.getInstance();

// Export both default and named exports to match speakeasy's export pattern
export default speakeasyMock;
export const generateSecret = speakeasyMock.generateSecret;
export const verify = speakeasyMock.verify;
export const totp = speakeasyMock.totp;
export const otpauthURL = speakeasyMock.otpauthURL;
export const time = speakeasyMock.time;

// Mock the module
jest.mock('speakeasy', () => ({
  __esModule: true,
  default: speakeasyMock,
  generateSecret: speakeasyMock.generateSecret,
  verify: speakeasyMock.verify,
  totp: speakeasyMock.totp,
  otpauthURL: speakeasyMock.otpauthURL,
  time: speakeasyMock.time,
}));

// Helper functions for test setup
export const setupSpeakeasyMock = (config?: SpeakeasyMockConfig): SpeakeasyMock => {
  const mock = SpeakeasyMock.getInstance(config);
  mock.reset();
  if (config) {
    mock.updateConfig(config);
  }
  return mock;
};

// Common test scenarios
export const speakeasyTestScenarios = {
  validGeneration: {
    generateSecretResult: {
      base32: 'JBSWY3DPEHPK3PXP',
      otpauth_url: 'otpauth://totp/Test%20App:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Test%20App'
    }
  },
  generationError: {
    generateSecretError: new Error('Failed to generate secret')
  },
  validVerification: {
    verifyResult: true
  },
  invalidVerification: {
    verifyResult: false
  },
  verificationError: {
    verifyError: new Error('Verification failed')
  }
};