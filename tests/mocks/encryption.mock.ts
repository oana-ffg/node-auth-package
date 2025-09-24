/**
 * Mock implementation for encryption utilities
 * Used for testing encryption/decryption functionality
 */

export interface EncryptionMockConfig {
  encryptResult?: {
    encryptedData: {
      encrypted: string;
      iv: string;
      tag: string;
      salt: string;
    };
    version: string;
  };
  decryptResult?: string;
  serializeResult?: string;
  deserializeResult?: {
    encrypted: string;
    iv: string;
    tag: string;
    salt: string;
  };
  encryptError?: Error;
  decryptError?: Error;
  serializeError?: Error;
  deserializeError?: Error;
}

export class EncryptionMock {
  private config: EncryptionMockConfig;
  private static instance: EncryptionMock;

  constructor(config: EncryptionMockConfig = {}) {
    this.config = {
      encryptResult: {
        encryptedData: {
          encrypted: 'encrypted_secret',
          iv: 'mock_iv',
          tag: 'mock_tag',
          salt: 'mock_salt'
        },
        version: 'v1'
      },
      decryptResult: 'JBSWY3DPEHPK3PXP',
      serializeResult: 'serialized_encrypted_data',
      deserializeResult: {
        encrypted: 'encrypted_secret',
        iv: 'mock_iv',
        tag: 'mock_tag',
        salt: 'mock_salt'
      },
      ...config
    };
  }

  static getInstance(config?: EncryptionMockConfig): EncryptionMock {
    if (!EncryptionMock.instance) {
      EncryptionMock.instance = new EncryptionMock(config);
    }
    if (config) {
      EncryptionMock.instance.updateConfig(config);
    }
    return EncryptionMock.instance;
  }

  updateConfig(config: Partial<EncryptionMockConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.config = {
      encryptResult: {
        encryptedData: {
          encrypted: 'encrypted_secret',
          iv: 'mock_iv',
          tag: 'mock_tag',
          salt: 'mock_salt'
        },
        version: 'v1'
      },
      decryptResult: 'JBSWY3DPEHPK3PXP',
      serializeResult: 'serialized_encrypted_data',
      deserializeResult: {
        encrypted: 'encrypted_secret',
        iv: 'mock_iv',
        tag: 'mock_tag',
        salt: 'mock_salt'
      }
    };
  }

  // Mock the encrypt2FASecret function
  encrypt2FASecret = jest.fn().mockImplementation((secret: string) => {
    if (this.config.encryptError) {
      throw this.config.encryptError;
    }

    return this.config.encryptResult;
  });

  // Mock the decrypt2FASecret function
  decrypt2FASecret = jest.fn().mockImplementation((encryptedData: any, version: string) => {
    if (this.config.decryptError) {
      throw this.config.decryptError;
    }

    return this.config.decryptResult;
  });

  // Mock the serializeEncryptedData function
  serializeEncryptedData = jest.fn().mockImplementation((encryptedData: any) => {
    if (this.config.serializeError) {
      throw this.config.serializeError;
    }

    return this.config.serializeResult;
  });

  // Mock the deserializeEncryptedData function
  deserializeEncryptedData = jest.fn().mockImplementation((serializedData: string) => {
    if (this.config.deserializeError) {
      throw this.config.deserializeError;
    }

    return this.config.deserializeResult;
  });

  // Mock the initializeEncryption function
  initializeEncryption = jest.fn().mockImplementation((config: any) => {
    // Mock implementation - doesn't need to do anything
  });
}

// Create the default mock instance
const encryptionMock = EncryptionMock.getInstance();

// Export individual functions to match encryption module's export pattern
export const encrypt2FASecret = encryptionMock.encrypt2FASecret;
export const decrypt2FASecret = encryptionMock.decrypt2FASecret;
export const serializeEncryptedData = encryptionMock.serializeEncryptedData;
export const deserializeEncryptedData = encryptionMock.deserializeEncryptedData;
export const initializeEncryption = encryptionMock.initializeEncryption;

// Export default
export default encryptionMock;

// Helper functions for test setup
export const setupEncryptionMock = (config?: EncryptionMockConfig): EncryptionMock => {
  const mock = EncryptionMock.getInstance(config);
  mock.reset();
  if (config) {
    mock.updateConfig(config);
  }
  return mock;
};

// Common test scenarios
export const encryptionTestScenarios = {
  validEncryption: {
    encryptResult: {
      encryptedData: {
        encrypted: 'encrypted_secret',
        iv: 'mock_iv',
        tag: 'mock_tag',
        salt: 'mock_salt'
      },
      version: 'v1'
    }
  },
  encryptionError: {
    encryptError: new Error('Encryption failed')
  },
  validDecryption: {
    decryptResult: 'JBSWY3DPEHPK3PXP'
  },
  decryptionError: {
    decryptError: new Error('Decryption failed')
  },
  serializationError: {
    serializeError: new Error('Serialization failed')
  },
  deserializationError: {
    deserializeError: new Error('Deserialization failed')
  }
};