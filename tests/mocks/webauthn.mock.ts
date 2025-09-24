/**
 * Mock implementation for @simplewebauthn/server and @simplewebauthn/types
 * Used for testing WebAuthn/passkey functionality
 */

import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';

import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';

// Mock response types
export interface MockRegistrationOptions extends PublicKeyCredentialCreationOptionsJSON {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    alg: number;
    type: 'public-key';
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    userVerification?: 'required' | 'preferred' | 'discouraged';
    residentKey?: 'required' | 'preferred' | 'discouraged';
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
  timeout?: number;
}

export interface MockAuthenticationOptions extends PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  allowCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: Array<'usb' | 'nfc' | 'ble' | 'internal'>;
  }>;
  userVerification?: 'required' | 'preferred' | 'discouraged';
  timeout?: number;
}

export interface MockVerificationResult {
  verified: boolean;
  registrationInfo?: {
    credential: {
      publicKey: Uint8Array;
      counter: number;
    };
    credentialDeviceType: 'singleDevice' | 'multiDevice';
    credentialBackedUp: boolean;
  };
  authenticationInfo?: {
    newCounter: number;
    credentialDeviceType: 'singleDevice' | 'multiDevice';
    credentialBackedUp: boolean;
  };
}

export interface WebAuthnMockConfig {
  registrationOptions?: Partial<MockRegistrationOptions>;
  authenticationOptions?: Partial<MockAuthenticationOptions>;
  registrationVerification?: MockVerificationResult;
  authenticationVerification?: MockVerificationResult;
  registrationError?: Error;
  authenticationError?: Error;
  verificationError?: Error;
}

export class WebAuthnMock {
  private config: WebAuthnMockConfig;
  private static instance: WebAuthnMock;

  constructor(config: WebAuthnMockConfig = {}) {
    this.config = {
      registrationOptions: {
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        rp: {
          name: 'Test App',
          id: 'localhost'
        },
        user: {
          id: 'dGVzdC11c2VyLWlk',
          name: 'test@example.com',
          displayName: 'Test User'
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        timeout: 60000,
        attestation: 'none'
      },
      authenticationOptions: {
        challenge: 'dGVzdC1hdXRoLWNoYWxsZW5nZQ',
        timeout: 60000,
        userVerification: 'preferred'
      },
      registrationVerification: {
        verified: true,
        registrationInfo: {
          credential: {
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false
        }
      },
      authenticationVerification: {
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false
        }
      },
      ...config
    };
  }

  static getInstance(config?: WebAuthnMockConfig): WebAuthnMock {
    if (!WebAuthnMock.instance) {
      WebAuthnMock.instance = new WebAuthnMock(config);
    }
    if (config) {
      WebAuthnMock.instance.updateConfig(config);
    }
    return WebAuthnMock.instance;
  }

  updateConfig(config: Partial<WebAuthnMockConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.config = {
      registrationOptions: {
        challenge: 'dGVzdC1jaGFsbGVuZ2U',
        rp: {
          name: 'Test App',
          id: 'localhost'
        },
        user: {
          id: 'dGVzdC11c2VyLWlk',
          name: 'test@example.com',
          displayName: 'Test User'
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        timeout: 60000,
        attestation: 'none'
      },
      authenticationOptions: {
        challenge: 'dGVzdC1hdXRoLWNoYWxsZW5nZQ',
        timeout: 60000,
        userVerification: 'preferred'
      },
      registrationVerification: {
        verified: true,
        registrationInfo: {
          credential: {
            publicKey: new Uint8Array([1, 2, 3, 4, 5]),
            counter: 0,
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false
        }
      },
      authenticationVerification: {
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false
        }
      }
    };
  }

  // Mock generateRegistrationOptions
  generateRegistrationOptions = jest.fn().mockImplementation((options: GenerateRegistrationOptionsOpts): MockRegistrationOptions => {
    if (this.config.registrationError) {
      throw this.config.registrationError;
    }

    const defaults = this.config.registrationOptions!;
    return {
      ...defaults,
      rp: {
        ...defaults.rp!,
        ...options.rpName && { name: options.rpName },
        ...options.rpID && { id: options.rpID }
      },
      user: {
        ...defaults.user!,
        ...options.userID && { id: options.userID },
        ...options.userName && { name: options.userName },
        ...options.userDisplayName && { displayName: options.userDisplayName }
      },
      ...options.timeout && { timeout: options.timeout },
      ...options.attestationType && { attestation: options.attestationType },
      ...options.authenticatorSelection && { authenticatorSelection: options.authenticatorSelection }
    } as MockRegistrationOptions;
  });

  // Mock generateAuthenticationOptions
  generateAuthenticationOptions = jest.fn().mockImplementation((options: GenerateAuthenticationOptionsOpts = {}): MockAuthenticationOptions => {
    if (this.config.authenticationError) {
      throw this.config.authenticationError;
    }

    const defaults = this.config.authenticationOptions!;
    return {
      ...defaults,
      ...options.timeout && { timeout: options.timeout },
      ...options.userVerification && { userVerification: options.userVerification },
      ...options.allowCredentials && { allowCredentials: options.allowCredentials }
    } as MockAuthenticationOptions;
  });

  // Mock verifyRegistrationResponse
  verifyRegistrationResponse = jest.fn().mockImplementation(async (options: VerifyRegistrationResponseOpts): Promise<MockVerificationResult> => {
    if (this.config.verificationError) {
      throw this.config.verificationError;
    }

    // Simulate different verification scenarios
    const response = options.response as RegistrationResponseJSON;

    if (response.id === 'invalid-credential') {
      return { verified: false };
    }

    if (response.id === 'error-credential') {
      throw new Error('Verification failed');
    }

    return this.config.registrationVerification!;
  });

  // Mock verifyAuthenticationResponse
  verifyAuthenticationResponse = jest.fn().mockImplementation(async (options: VerifyAuthenticationResponseOpts): Promise<MockVerificationResult> => {
    if (this.config.verificationError) {
      throw this.config.verificationError;
    }

    // Simulate different verification scenarios
    const response = options.response as AuthenticationResponseJSON;

    if (response.id === 'invalid-credential') {
      return { verified: false };
    }

    if (response.id === 'error-credential') {
      throw new Error('Authentication failed');
    }

    return this.config.authenticationVerification!;
  });
}

// Create the default mock instance
const webauthnMock = WebAuthnMock.getInstance();

// Export the mock functions
export const generateRegistrationOptions = webauthnMock.generateRegistrationOptions;
export const generateAuthenticationOptions = webauthnMock.generateAuthenticationOptions;
export const verifyRegistrationResponse = webauthnMock.verifyRegistrationResponse;
export const verifyAuthenticationResponse = webauthnMock.verifyAuthenticationResponse;

// Mock the @simplewebauthn/server module
jest.mock('@simplewebauthn/server', () => ({
  __esModule: true,
  generateRegistrationOptions: webauthnMock.generateRegistrationOptions,
  generateAuthenticationOptions: webauthnMock.generateAuthenticationOptions,
  verifyRegistrationResponse: webauthnMock.verifyRegistrationResponse,
  verifyAuthenticationResponse: webauthnMock.verifyAuthenticationResponse,
}));

// Mock the @simplewebauthn/types module (mostly types, but may include some utilities)
jest.mock('@simplewebauthn/types', () => ({
  __esModule: true,
  // Add any utility functions that might be imported from types
}));

// Helper functions for test setup
export const setupWebAuthnMock = (config?: WebAuthnMockConfig): WebAuthnMock => {
  const mock = WebAuthnMock.getInstance(config);
  mock.reset();
  if (config) {
    mock.updateConfig(config);
  }
  return mock;
};

// Common test scenarios
export const webauthnTestScenarios = {
  successfulRegistration: {
    registrationVerification: {
      verified: true,
      registrationInfo: {
        credential: {
          publicKey: new Uint8Array([1, 2, 3, 4, 5]),
          counter: 0,
        },
        credentialDeviceType: 'singleDevice' as const,
        credentialBackedUp: false
      }
    }
  },
  failedRegistration: {
    registrationVerification: {
      verified: false
    }
  },
  successfulAuthentication: {
    authenticationVerification: {
      verified: true,
      authenticationInfo: {
        newCounter: 1,
        credentialDeviceType: 'singleDevice' as const,
        credentialBackedUp: false
      }
    }
  },
  failedAuthentication: {
    authenticationVerification: {
      verified: false
    }
  },
  registrationError: {
    registrationError: new Error('Registration options generation failed')
  },
  verificationError: {
    verificationError: new Error('Verification failed')
  }
};

// Export the mock instance for direct manipulation in tests
export { webauthnMock };
export default webauthnMock;