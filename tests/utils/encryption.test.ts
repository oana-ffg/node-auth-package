/**
 * Tests for encryption utilities
 * Covers encryption/decryption functionality, serialization, key rotation, and serverless modes
 */

import {
  EncryptionUtil,
  EncryptionConfig,
  serializeEncryptedData,
  deserializeEncryptedData,
  initializeEncryption,
  encrypt2FASecret,
  decrypt2FASecret
} from '../../src/utils/encryption';

describe('EncryptionUtil', () => {
  let encryptionUtil: EncryptionUtil;
  let testConfig: EncryptionConfig;

  beforeEach(() => {
    testConfig = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      saltLength: 32,
      pbkdf2Iterations: 100000,
      keys: {
        v1: 'test-encryption-key-v1-32-chars-min',
        v2: 'test-encryption-key-v2-32-chars-min'
      },
      currentVersion: 'v1',
      serverless: false
    };
    encryptionUtil = new EncryptionUtil(testConfig);
  });

  describe('constructor and configuration', () => {
    it('should create instance with valid config', () => {
      expect(encryptionUtil).toBeInstanceOf(EncryptionUtil);
    });

    it('should validate config in standard mode', () => {
      const invalidConfig = {
        ...testConfig,
        keys: { v1: 'short' }
      };

      expect(() => new EncryptionUtil(invalidConfig)).toThrow(
        'Encryption key v1 must be at least 32 characters long'
      );
    });

    it('should skip validation in serverless mode', () => {
      const invalidConfig = {
        ...testConfig,
        keys: { v1: 'short' },
        serverless: true
      };

      expect(() => new EncryptionUtil(invalidConfig)).not.toThrow();
    });

    it('should throw error for invalid v2 key', () => {
      const invalidConfig = {
        ...testConfig,
        keys: {
          v1: 'test-encryption-key-v1-32-chars-min',
          v2: 'short'
        }
      };

      expect(() => new EncryptionUtil(invalidConfig)).toThrow(
        'Encryption key v2 must be at least 32 characters long'
      );
    });

    it('should throw error for invalid current version', () => {
      const invalidConfig = {
        ...testConfig,
        currentVersion: 'v3'
      };

      expect(() => new EncryptionUtil(invalidConfig)).toThrow(
        'Current version must be either "v1" or "v2"'
      );
    });
  });

  describe('encryptSecret', () => {
    it('should encrypt text with v1 key', () => {
      const plaintext = 'test-secret-to-encrypt';
      const result = encryptionUtil.encryptSecret(plaintext, 'v1');

      expect(result).toHaveProperty('encrypted');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('tag');
      expect(result).toHaveProperty('salt');
      expect(typeof result.encrypted).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(typeof result.tag).toBe('string');
      expect(typeof result.salt).toBe('string');
    });

    it('should encrypt text with v2 key', () => {
      const plaintext = 'test-secret-to-encrypt';
      const result = encryptionUtil.encryptSecret(plaintext, 'v2');

      expect(result).toHaveProperty('encrypted');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('tag');
      expect(result).toHaveProperty('salt');
    });

    it('should generate unique salt for each encryption', () => {
      const plaintext = 'test-secret';
      const result1 = encryptionUtil.encryptSecret(plaintext, 'v1');
      const result2 = encryptionUtil.encryptSecret(plaintext, 'v1');

      expect(result1.salt).not.toBe(result2.salt);
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('should throw error for non-existent key version', () => {
      const plaintext = 'test-secret';

      expect(() => encryptionUtil.encryptSecret(plaintext, 'v3')).toThrow(
        'Encryption key for version v3 not found'
      );
    });

    it('should throw error when v2 key is not configured', () => {
      const configWithoutV2 = {
        ...testConfig,
        keys: { v1: 'test-encryption-key-v1-32-chars-min' }
      };
      const util = new EncryptionUtil(configWithoutV2);

      expect(() => util.encryptSecret('test', 'v2')).toThrow(
        'Encryption key for version v2 not found'
      );
    });
  });

  describe('decryptSecret', () => {
    it('should decrypt previously encrypted data with v1 key', () => {
      const plaintext = 'test-secret-to-decrypt';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');
      const decrypted = encryptionUtil.decryptSecret(encrypted, 'v1');

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt previously encrypted data with v2 key', () => {
      const plaintext = 'test-secret-to-decrypt';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v2');
      const decrypted = encryptionUtil.decryptSecret(encrypted, 'v2');

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters and unicode', () => {
      const plaintext = 'Special chars: !@#$%^&*()_+{}|:"<>?[]\\;\',./ Unicode: 🔐🔑';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');
      const decrypted = encryptionUtil.decryptSecret(encrypted, 'v1');

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');
      const decrypted = encryptionUtil.decryptSecret(encrypted, 'v1');

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');
      const decrypted = encryptionUtil.decryptSecret(encrypted, 'v1');

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for tampered encrypted data', () => {
      const plaintext = 'test-secret';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');

      // Tamper with the encrypted data
      const tamperedData = {
        ...encrypted,
        encrypted: encrypted.encrypted.substring(0, encrypted.encrypted.length - 2) + '00'
      };

      expect(() => encryptionUtil.decryptSecret(tamperedData, 'v1')).toThrow();
    });

    it('should throw error for tampered IV', () => {
      const plaintext = 'test-secret';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');

      const tamperedData = {
        ...encrypted,
        iv: encrypted.iv.substring(0, encrypted.iv.length - 2) + '00'
      };

      expect(() => encryptionUtil.decryptSecret(tamperedData, 'v1')).toThrow();
    });

    it('should throw error for tampered tag', () => {
      const plaintext = 'test-secret';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');

      const tamperedData = {
        ...encrypted,
        tag: encrypted.tag.substring(0, encrypted.tag.length - 2) + '00'
      };

      expect(() => encryptionUtil.decryptSecret(tamperedData, 'v1')).toThrow();
    });

    it('should throw error for tampered salt', () => {
      const plaintext = 'test-secret';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');

      const tamperedData = {
        ...encrypted,
        salt: encrypted.salt.substring(0, encrypted.salt.length - 2) + '00'
      };

      expect(() => encryptionUtil.decryptSecret(tamperedData, 'v1')).toThrow();
    });

    it('should throw error for wrong key version', () => {
      const plaintext = 'test-secret';
      const encrypted = encryptionUtil.encryptSecret(plaintext, 'v1');

      expect(() => encryptionUtil.decryptSecret(encrypted, 'v2')).toThrow();
    });
  });

  describe('encrypt2FASecret and decrypt2FASecret', () => {
    it('should encrypt and decrypt 2FA secret with current version', () => {
      const secret = 'JBSWY3DPEHPK3PXP'; // Base32 TOTP secret
      const result = encryptionUtil.encrypt2FASecret(secret);

      expect(result).toHaveProperty('encryptedData');
      expect(result).toHaveProperty('version');
      expect(result.version).toBe(testConfig.currentVersion);

      const decrypted = encryptionUtil.decrypt2FASecret(result.encryptedData, result.version);
      expect(decrypted).toBe(secret);
    });

    it('should use current version from config', () => {
      const configV2 = { ...testConfig, currentVersion: 'v2' };
      const utilV2 = new EncryptionUtil(configV2);

      const secret = 'JBSWY3DPEHPK3PXP';
      const result = utilV2.encrypt2FASecret(secret);

      expect(result.version).toBe('v2');
    });
  });

  describe('key rotation scenarios', () => {
    it('should decrypt data encrypted with old key using new utility instance', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      // Encrypt with v1
      const encryptedWithV1 = encryptionUtil.encryptSecret(secret, 'v1');

      // Create new utility with v2 as current but still having v1
      const newConfig = {
        ...testConfig,
        currentVersion: 'v2',
        keys: {
          v1: 'test-encryption-key-v1-32-chars-min',
          v2: 'test-encryption-key-v2-32-chars-min'
        }
      };
      const newUtil = new EncryptionUtil(newConfig);

      // Should still be able to decrypt v1 data
      const decrypted = newUtil.decryptSecret(encryptedWithV1, 'v1');
      expect(decrypted).toBe(secret);

      // New encryptions should use v2
      const newEncryption = newUtil.encrypt2FASecret(secret);
      expect(newEncryption.version).toBe('v2');
    });

    it('should handle backward compatibility', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      // Encrypt with both versions
      const encryptedV1 = encryptionUtil.encryptSecret(secret, 'v1');
      const encryptedV2 = encryptionUtil.encryptSecret(secret, 'v2');

      // Should be able to decrypt both
      expect(encryptionUtil.decryptSecret(encryptedV1, 'v1')).toBe(secret);
      expect(encryptionUtil.decryptSecret(encryptedV2, 'v2')).toBe(secret);
    });
  });

  describe('serverless mode optimization', () => {
    it('should skip validation in serverless mode for faster cold starts', () => {
      const serverlessConfig = {
        ...testConfig,
        serverless: true,
        keys: { v1: 'short-key-that-would-fail-validation' }
      };

      // Should not throw error even with invalid key length
      expect(() => new EncryptionUtil(serverlessConfig)).not.toThrow();
    });

    it('should still function properly in serverless mode with valid keys', () => {
      const serverlessConfig = {
        ...testConfig,
        serverless: true
      };
      const serverlessUtil = new EncryptionUtil(serverlessConfig);

      const secret = 'test-secret-serverless';
      const encrypted = serverlessUtil.encryptSecret(secret, 'v1');
      const decrypted = serverlessUtil.decryptSecret(encrypted, 'v1');

      expect(decrypted).toBe(secret);
    });
  });
});

describe('Serialization and Deserialization', () => {
  let testEncryptedData: any;

  beforeEach(() => {
    testEncryptedData = {
      encrypted: 'test-encrypted-data',
      iv: 'test-iv-value',
      tag: 'test-tag-value',
      salt: 'test-salt-value'
    };
  });

  describe('serializeEncryptedData', () => {
    it('should serialize encrypted data to base64 JSON', () => {
      const serialized = serializeEncryptedData(testEncryptedData);

      expect(typeof serialized).toBe('string');
      expect(() => Buffer.from(serialized, 'base64')).not.toThrow();

      // Should be valid base64
      const decoded = Buffer.from(serialized, 'base64').toString('utf8');
      expect(() => JSON.parse(decoded)).not.toThrow();
    });

    it('should handle empty encrypted data object', () => {
      const emptyData = {
        encrypted: '',
        iv: '',
        tag: '',
        salt: ''
      };

      const serialized = serializeEncryptedData(emptyData);
      expect(typeof serialized).toBe('string');
    });

    it('should handle special characters in encrypted data', () => {
      const dataWithSpecialChars = {
        ...testEncryptedData,
        encrypted: 'data-with-special-chars-!@#$%^&*()'
      };

      const serialized = serializeEncryptedData(dataWithSpecialChars);
      expect(typeof serialized).toBe('string');
    });
  });

  describe('deserializeEncryptedData', () => {
    it('should deserialize valid serialized data', () => {
      const serialized = serializeEncryptedData(testEncryptedData);
      const deserialized = deserializeEncryptedData(serialized);

      expect(deserialized).toEqual(testEncryptedData);
    });

    it('should throw error for invalid base64', () => {
      const invalidBase64 = 'not-valid-base64!@#';

      expect(() => deserializeEncryptedData(invalidBase64)).toThrow(
        'Failed to deserialize encrypted data'
      );
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = Buffer.from('not-valid-json').toString('base64');

      expect(() => deserializeEncryptedData(invalidJson)).toThrow(
        'Failed to deserialize encrypted data'
      );
    });

    it('should throw error for missing required fields', () => {
      const incompleteData = { encrypted: 'test' };
      const serialized = Buffer.from(JSON.stringify(incompleteData)).toString('base64');

      expect(() => deserializeEncryptedData(serialized)).toThrow(
        'Invalid encrypted data format - missing required fields'
      );
    });

    it('should throw error for missing salt field', () => {
      const dataWithoutSalt = {
        encrypted: 'test',
        iv: 'test',
        tag: 'test'
      };
      const serialized = Buffer.from(JSON.stringify(dataWithoutSalt)).toString('base64');

      expect(() => deserializeEncryptedData(serialized)).toThrow(
        'Invalid encrypted data format - missing salt field'
      );
    });

    it('should handle round-trip serialization/deserialization', () => {
      const original = testEncryptedData;
      const serialized = serializeEncryptedData(original);
      const deserialized = deserializeEncryptedData(serialized);

      expect(deserialized).toEqual(original);
    });
  });
});

describe('Global encryption functions', () => {
  let testConfig: EncryptionConfig;

  beforeEach(() => {
    testConfig = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      saltLength: 32,
      pbkdf2Iterations: 100000,
      keys: {
        v1: 'test-encryption-key-v1-32-chars-min',
        v2: 'test-encryption-key-v2-32-chars-min'
      },
      currentVersion: 'v1',
      serverless: false
    };
  });

  describe('initializeEncryption', () => {
    it('should initialize global encryption functions', () => {
      initializeEncryption(testConfig);

      expect(typeof encrypt2FASecret).toBe('function');
      expect(typeof decrypt2FASecret).toBe('function');
    });

    it('should make global functions work after initialization', () => {
      initializeEncryption(testConfig);

      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = encrypt2FASecret(secret);
      const decrypted = decrypt2FASecret(encrypted.encryptedData, encrypted.version);

      expect(decrypted).toBe(secret);
    });

    it('should use current version from config', () => {
      const configV2 = { ...testConfig, currentVersion: 'v2' };
      initializeEncryption(configV2);

      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = encrypt2FASecret(secret);

      expect(encrypted.version).toBe('v2');
    });

    it('should support override config in decrypt function', () => {
      initializeEncryption(testConfig);

      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = encrypt2FASecret(secret);

      // Create override config with different key
      const overrideConfig = {
        ...testConfig,
        keys: {
          v1: 'different-encryption-key-v1-32-min',
          v2: 'different-encryption-key-v2-32-min'
        }
      };

      // Should be able to decrypt with override config
      // Note: This would fail because the key is different, but that's expected
      expect(() => decrypt2FASecret(encrypted.encryptedData, encrypted.version, overrideConfig))
        .toThrow();
    });
  });
});

describe('Error handling for corrupted data', () => {
  let encryptionUtil: EncryptionUtil;
  let testConfig: EncryptionConfig;

  beforeEach(() => {
    testConfig = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      saltLength: 32,
      pbkdf2Iterations: 100000,
      keys: {
        v1: 'test-encryption-key-v1-32-chars-min'
      },
      currentVersion: 'v1',
      serverless: false
    };
    encryptionUtil = new EncryptionUtil(testConfig);
  });

  it('should handle corrupted encrypted data gracefully', () => {
    const corruptedData = {
      encrypted: 'corrupted-data',
      iv: 'corrupted-iv',
      tag: 'corrupted-tag',
      salt: 'corrupted-salt'
    };

    expect(() => encryptionUtil.decryptSecret(corruptedData, 'v1')).toThrow();
  });

  it('should provide meaningful error messages', () => {
    const corruptedData = {
      encrypted: 'invalid',
      iv: 'invalid',
      tag: 'invalid',
      salt: 'invalid'
    };

    expect(() => encryptionUtil.decryptSecret(corruptedData, 'v1')).toThrow(
      /Failed to decrypt secret with version v1/
    );
  });

  it('should handle invalid hex strings gracefully', () => {
    const invalidHexData = {
      encrypted: 'not-hex-data!@#',
      iv: 'not-hex-data!@#',
      tag: 'not-hex-data!@#',
      salt: 'not-hex-data!@#'
    };

    expect(() => encryptionUtil.decryptSecret(invalidHexData, 'v1')).toThrow();
  });
});