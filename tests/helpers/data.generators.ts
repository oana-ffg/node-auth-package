/**
 * Test Data Generators for firefun-node-auth tests
 *
 * This module provides utility functions to generate realistic test data
 * for users, passkeys, tokens, and other authentication entities.
 */

import { MockUser, MockPasskey, MockRefreshToken } from '../mocks/prisma.mock';
import { AuthConfig } from '../../src/types';

/**
 * Generate a mock user with optional overrides
 */
export function generateMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const defaultUser: MockUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    email: `test${Math.random().toString(36).substring(7)}@example.com`,
    password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm', // 'testPassword123!'
    twoFactorSecret: null,
    twoFactorEnabled: false,
    encryptionVersion: 'v1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { ...defaultUser, ...overrides };
}

/**
 * Generate a mock user with 2FA enabled
 */
export function generateMockUserWith2FA(overrides: Partial<MockUser> = {}): MockUser {
  return generateMockUser({
    twoFactorSecret: 'encrypted_secret_data',
    twoFactorEnabled: true,
    ...overrides,
  });
}

/**
 * Generate a mock passkey with optional overrides
 */
export function generateMockPasskey(userId: string, overrides: Partial<MockPasskey> = {}): MockPasskey {
  const defaultPasskey: MockPasskey = {
    id: `passkey_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    userId,
    credentialId: `credential_${Math.random().toString(36).substring(7)}`,
    publicKey: JSON.stringify({
      kty: 'EC',
      crv: 'P-256',
      x: 'example_x_coordinate',
      y: 'example_y_coordinate',
    }),
    counter: 0,
    name: `Test Device ${Math.random().toString(36).substring(7)}`,
    createdAt: new Date(),
  };

  return { ...defaultPasskey, ...overrides };
}

/**
 * Generate a mock refresh token with optional overrides
 */
export function generateMockRefreshToken(userId: string, overrides: Partial<MockRefreshToken> = {}): MockRefreshToken {
  const defaultToken: MockRefreshToken = {
    id: `token_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    userId,
    token: `refresh_${Math.random().toString(36).substring(7)}_${Date.now()}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    createdAt: new Date(),
  };

  return { ...defaultToken, ...overrides };
}

/**
 * Generate an expired refresh token
 */
export function generateExpiredRefreshToken(userId: string, overrides: Partial<MockRefreshToken> = {}): MockRefreshToken {
  return generateMockRefreshToken(userId, {
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    ...overrides,
  });
}

/**
 * Generate a valid JWT token for testing
 */
export function generateValidJWT(userId: string, secret: string = 'test-secret-key-at-least-32-characters-long-for-security'): string {
  const jwt = require('jsonwebtoken');

  return jwt.sign(
    {
      userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
    },
    secret,
    {
      expiresIn: '15m',
      algorithm: 'HS256'
    }
  );
}

/**
 * Generate an expired JWT token for testing
 */
export function generateExpiredJWT(userId: string, secret: string = 'test-secret-key-at-least-32-characters-long-for-security'): string {
  const jwt = require('jsonwebtoken');

  return jwt.sign(
    {
      userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    },
    secret,
    {
      expiresIn: '15m',
      algorithm: 'HS256'
    }
  );
}

/**
 * Generate a malformed JWT token for testing
 */
export function generateMalformedJWT(): string {
  return 'invalid.jwt.token';
}

/**
 * Generate valid registration data
 */
export function generateValidRegistrationData(overrides: any = {}) {
  return {
    email: `test${Math.random().toString(36).substring(7)}@example.com`,
    password: 'TestPassword123!',
    ...overrides,
  };
}

/**
 * Generate invalid registration data for testing validation
 */
export function generateInvalidRegistrationData() {
  return [
    // Invalid email formats
    { email: 'invalid-email', password: 'TestPassword123!' },
    { email: 'test@', password: 'TestPassword123!' },
    { email: '@example.com', password: 'TestPassword123!' },
    { email: 'test..test@example.com', password: 'TestPassword123!' },

    // Invalid password formats
    { email: 'test@example.com', password: 'short' }, // Too short
    { email: 'test@example.com', password: 'onlylowercase123!' }, // No uppercase
    { email: 'test@example.com', password: 'ONLYUPPERCASE123!' }, // No lowercase
    { email: 'test@example.com', password: 'NoNumbers!' }, // No numbers
    { email: 'test@example.com', password: 'NoSpecialChars123' }, // No special chars

    // Missing fields
    { email: 'test@example.com' }, // Missing password
    { password: 'TestPassword123!' }, // Missing email
    {}, // Missing both

    // Extra fields
    { email: 'test@example.com', password: 'TestPassword123!', extraField: 'should not be here' },
  ];
}

/**
 * Generate valid login data
 */
export function generateValidLoginData(overrides: any = {}) {
  return {
    email: 'test@example.com',
    password: 'TestPassword123!',
    ...overrides,
  };
}

/**
 * Generate valid 2FA data
 */
export function generateValid2FAData(overrides: any = {}) {
  return {
    token: '123456', // 6-digit TOTP code
    ...overrides,
  };
}

/**
 * Generate invalid 2FA tokens
 */
export function generateInvalid2FATokens() {
  return [
    '12345', // Too short
    '1234567', // Too long
    'abcdef', // Non-numeric
    '000000', // All zeros
    '', // Empty
    null, // Null
    undefined, // Undefined
  ];
}

/**
 * Generate WebAuthn registration challenge data
 */
export function generateWebAuthnRegistrationChallenge() {
  return {
    challenge: Buffer.from('test-challenge-' + Math.random().toString(36)).toString('base64url'),
    rp: {
      name: 'Test App',
      id: 'localhost',
    },
    user: {
      id: Buffer.from('user-id-' + Math.random().toString(36)).toString('base64url'),
      name: 'test@example.com',
      displayName: 'Test User',
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };
}

/**
 * Generate WebAuthn authentication challenge data
 */
export function generateWebAuthnAuthenticationChallenge() {
  return {
    challenge: Buffer.from('auth-challenge-' + Math.random().toString(36)).toString('base64url'),
    rpId: 'localhost',
    allowCredentials: [
      {
        type: 'public-key',
        id: Buffer.from('credential-id-' + Math.random().toString(36)).toString('base64url'),
      },
    ],
    userVerification: 'preferred',
    timeout: 60000,
  };
}

/**
 * Generate test auth configuration
 */
export function generateTestAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  const defaultConfig: AuthConfig = {
    appName: 'Test App',
    jwt: {
      secret: 'test-secret-key-at-least-32-characters-long-for-security',
      expiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    security: {
      bcryptRounds: 12,
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      saltLength: 32,
      pbkdf2Iterations: 100000,
      keys: {
        v1: 'test-encryption-key-at-least-32-characters-long',
      },
      currentVersion: 'v1',
      serverless: false,
    },
    webauthn: {
      rpName: 'Test App',
      rpId: 'localhost',
      origin: 'http://localhost:3000',
      timeout: 60000,
      userVerification: 'preferred',
    },
  };

  return { ...defaultConfig, ...overrides };
}

/**
 * Generate test data for various edge cases
 */
export const EdgeCaseGenerators = {
  // Generate user with special characters in email
  userWithSpecialEmail: () => generateMockUser({
    email: 'test+tag@example.co.uk',
  }),

  // Generate user with very long email
  userWithLongEmail: () => generateMockUser({
    email: 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com',
  }),

  // Generate passkey with large counter value
  passkeyWithLargeCounter: (userId: string) => generateMockPasskey(userId, {
    counter: 999999,
  }),

  // Generate expired tokens for cleanup testing
  expiredTokensForCleanup: (userId: string, count: number = 5) => {
    return Array.from({ length: count }, (_, i) =>
      generateExpiredRefreshToken(userId, {
        expiresAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000), // 1, 2, 3... days ago
      })
    );
  },

  // Generate tokens near expiration boundary
  tokensNearExpiration: (userId: string) => {
    const now = Date.now();
    return [
      generateMockRefreshToken(userId, { expiresAt: new Date(now + 1000) }), // Expires in 1 second
      generateMockRefreshToken(userId, { expiresAt: new Date(now - 1000) }), // Expired 1 second ago
      generateMockRefreshToken(userId, { expiresAt: new Date(now + 60000) }), // Expires in 1 minute
    ];
  },
};

/**
 * Batch generators for creating multiple entities
 */
export const BatchGenerators = {
  // Generate multiple users
  users: (count: number, overrides: Partial<MockUser> = []) => {
    return Array.from({ length: count }, (_, i) =>
      generateMockUser({
        email: `user${i}@example.com`,
        ...Array.isArray(overrides) ? overrides[i] || {} : overrides,
      })
    );
  },

  // Generate multiple passkeys for a user
  passkeys: (userId: string, count: number) => {
    return Array.from({ length: count }, (_, i) =>
      generateMockPasskey(userId, { name: `Device ${i + 1}` })
    );
  },

  // Generate multiple refresh tokens for a user
  refreshTokens: (userId: string, count: number) => {
    return Array.from({ length: count }, () => generateMockRefreshToken(userId));
  },
};