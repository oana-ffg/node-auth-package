import crypto from 'crypto';

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string; // Unique salt used for key derivation
}

export interface EncryptionConfig {
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
}

export class EncryptionUtil {
  private config: EncryptionConfig;

  constructor(config: EncryptionConfig) {
    this.config = config;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.keys.v1 || this.config.keys.v1.length < 32) {
      throw new Error('Encryption key v1 must be at least 32 characters long');
    }
    if (this.config.keys.v2 && this.config.keys.v2.length < 32) {
      throw new Error('Encryption key v2 must be at least 32 characters long');
    }
    if (!['v1', 'v2'].includes(this.config.currentVersion)) {
      throw new Error('Current version must be either "v1" or "v2"');
    }
  }

  /**
   * Derives a 32-byte key from the provided password/key string using PBKDF2 with a unique salt
   * @param keyString - The key string from environment variables
   * @param salt - Unique salt for key derivation (must be provided for security)
   * @returns 32-byte key for AES-256
   */
  private deriveKey(keyString: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(keyString, salt, this.config.pbkdf2Iterations, this.config.keyLength, 'sha256');
  }

  /**
   * Async version of key derivation for better performance in high-concurrency scenarios
   * @param keyString - The key string from environment variables
   * @param salt - Unique salt for key derivation (must be provided for security)
   * @returns Promise resolving to 32-byte key for AES-256
   */
  private async deriveKeyAsync(keyString: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(keyString, salt, this.config.pbkdf2Iterations, this.config.keyLength, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  /**
   * Gets the encryption key for a specific version from configuration
   * @param version - The key version ('v1' or 'v2')
   * @param salt - Unique salt for key derivation
   * @returns The derived encryption key
   * @throws Error if the key is not found or invalid
   */
  private getEncryptionKey(version: string, salt: Buffer): Buffer {
    let keyString: string;

    if (version === 'v1') {
      keyString = this.config.keys.v1;
    } else if (version === 'v2' && this.config.keys.v2) {
      keyString = this.config.keys.v2;
    } else {
      throw new Error(`Encryption key for version ${version} not found`);
    }

    return this.deriveKey(keyString, salt);
  }

  /**
   * Encrypts a string using AES-256-GCM with the specified key version
   * @param text - The text to encrypt
   * @param version - The encryption key version to use ('v1' or 'v2')
   * @returns Object containing encrypted data, IV, authentication tag, and unique salt
   * @throws Error if encryption fails
   */
  public encryptSecret(text: string, version: string): EncryptedData {
    try {
      // Generate unique salt for this encryption operation
      const salt = crypto.randomBytes(this.config.saltLength);
      const key = this.getEncryptionKey(version, salt);
      const iv = crypto.randomBytes(this.config.ivLength);
      const cipher = crypto.createCipheriv(this.config.algorithm, key, iv);
      (cipher as any).setAAD(Buffer.from(version)); // Use version as additional authenticated data

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = (cipher as any).getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        salt: salt.toString('hex')
      };
    } catch (error) {
      throw new Error(`Failed to encrypt secret with version ${version}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypts a string using AES-256-GCM with the specified key version
   * @param encryptedData - Object containing encrypted data, IV, authentication tag, and salt
   * @param version - The encryption key version that was used ('v1' or 'v2')
   * @returns The decrypted text
   * @throws Error if decryption fails or authentication fails
   */
  public decryptSecret(encryptedData: EncryptedData, version: string): string {
    try {
      // Use the same salt that was used during encryption
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const key = this.getEncryptionKey(version, salt);
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const decipher = crypto.createDecipheriv(this.config.algorithm, key, iv);

      (decipher as any).setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
      (decipher as any).setAAD(Buffer.from(version)); // Use same version as AAD

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt secret with version ${version}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypts a 2FA secret using the current encryption version
   * @param secret - The base32 2FA secret to encrypt
   * @returns Object containing encrypted data and version used
   */
  public encrypt2FASecret(secret: string): { encryptedData: EncryptedData; version: string } {
    const version = this.config.currentVersion;
    const encryptedData = this.encryptSecret(secret, version);

    return {
      encryptedData,
      version
    };
  }

  /**
   * Decrypts a 2FA secret using the specified version
   * @param encryptedData - The encrypted data object
   * @param version - The encryption version that was used
   * @returns The decrypted base32 2FA secret
   */
  public decrypt2FASecret(encryptedData: EncryptedData, version: string): string {
    return this.decryptSecret(encryptedData, version);
  }
}

/**
 * Serializes encrypted data to a string for database storage
 * @param encryptedData - The encrypted data object
 * @returns Base64-encoded JSON string
 */
export function serializeEncryptedData(encryptedData: EncryptedData): string {
  return Buffer.from(JSON.stringify(encryptedData)).toString('base64');
}

/**
 * Deserializes encrypted data from database storage
 * @param serializedData - Base64-encoded JSON string
 * @returns The encrypted data object
 * @throws Error if data is invalid
 */
export function deserializeEncryptedData(serializedData: string): EncryptedData {
  try {
    const jsonString = Buffer.from(serializedData, 'base64').toString('utf8');
    const data = JSON.parse(jsonString);

    if (!data.encrypted || !data.iv || !data.tag) {
      throw new Error('Invalid encrypted data format - missing required fields (encrypted, iv, tag)');
    }

    // Check for salt field - required for security
    if (!data.salt) {
      throw new Error('Invalid encrypted data format - missing salt field. This data was encrypted with an insecure version and must be re-encrypted.');
    }

    return data as EncryptedData;
  } catch (error) {
    throw new Error(`Failed to deserialize encrypted data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Backwards compatibility functions that use global config
export let encrypt2FASecret: (secret: string) => { encryptedData: EncryptedData; version: string };
export let decrypt2FASecret: (encryptedData: EncryptedData, version: string, config?: EncryptionConfig) => string;

export function initializeEncryption(config: EncryptionConfig): void {
  const encryptionUtil = new EncryptionUtil(config);

  encrypt2FASecret = (secret: string) => encryptionUtil.encrypt2FASecret(secret);
  decrypt2FASecret = (encryptedData: EncryptedData, version: string, overrideConfig?: EncryptionConfig) => {
    if (overrideConfig) {
      const tempUtil = new EncryptionUtil(overrideConfig);
      return tempUtil.decrypt2FASecret(encryptedData, version);
    }
    return encryptionUtil.decrypt2FASecret(encryptedData, version);
  };
}