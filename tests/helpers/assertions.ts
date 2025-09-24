/**
 * Custom Test Assertions for firefun-node-auth tests
 *
 * This module provides custom Jest matchers and assertion utilities
 * specifically designed for testing authentication functionality.
 */

import { Response } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Assert that a response has the expected authentication structure
 */
export function expectAuthResponse(response: any, expected: {
  success?: boolean;
  message?: string;
  accessToken?: boolean;
  refreshToken?: boolean;
  user?: boolean;
}) {
  if (expected.success !== undefined) {
    expect(response.success).toBe(expected.success);
  }

  if (expected.message) {
    expect(response.message).toBe(expected.message);
  }

  if (expected.accessToken) {
    expect(response).toHaveProperty('accessToken');
    expect(typeof response.accessToken).toBe('string');
    expect(response.accessToken.length).toBeGreaterThan(0);
  }

  if (expected.refreshToken) {
    expect(response).toHaveProperty('refreshToken');
    expect(typeof response.refreshToken).toBe('string');
    expect(response.refreshToken.length).toBeGreaterThan(0);
  }

  if (expected.user) {
    expect(response).toHaveProperty('user');
    expect(response.user).toHaveProperty('id');
    expect(response.user).toHaveProperty('email');
    // Should not expose sensitive data
    expect(response.user).not.toHaveProperty('hashedPassword');
    expect(response.user).not.toHaveProperty('twoFactorSecret');
  }
}

/**
 * Assert that a response has the expected error structure
 */
export function expectErrorResponse(response: any, expected: {
  success?: boolean;
  message?: string;
  error?: string;
  statusCode?: number;
}) {
  if (expected.success !== undefined) {
    expect(response.success).toBe(expected.success);
  }

  if (expected.message) {
    expect(response.message).toContain(expected.message);
  }

  if (expected.error) {
    expect(response.error).toBe(expected.error);
  }

  if (expected.statusCode) {
    expect(response.statusCode).toBe(expected.statusCode);
  }

  // Error responses should not expose sensitive data
  expect(response).not.toHaveProperty('accessToken');
  expect(response).not.toHaveProperty('refreshToken');
  expect(response).not.toHaveProperty('user');
}

/**
 * Assert that a JWT token is valid and contains expected claims
 */
export function expectValidJWT(
  token: string,
  secret: string,
  expectedClaims: {
    userId?: string;
    type?: string;
    iat?: number;
    exp?: number;
  } = {}
) {
  expect(token).toBeDefined();
  expect(typeof token).toBe('string');
  expect(token.split('.')).toHaveLength(3); // JWT has 3 parts

  const decoded = jwt.verify(token, secret) as any;

  if (expectedClaims.userId) {
    expect(decoded.userId).toBe(expectedClaims.userId);
  }

  if (expectedClaims.type) {
    expect(decoded.type).toBe(expectedClaims.type);
  }

  if (expectedClaims.iat) {
    expect(decoded.iat).toBe(expectedClaims.iat);
  }

  if (expectedClaims.exp) {
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  }

  // Should have required claims
  expect(decoded).toHaveProperty('iat');
  expect(decoded).toHaveProperty('exp');
  expect(decoded.exp).toBeGreaterThan(decoded.iat);
}

/**
 * Assert that a JWT token is expired
 */
export function expectExpiredJWT(token: string, secret: string) {
  expect(() => {
    jwt.verify(token, secret);
  }).toThrow('jwt expired');
}

/**
 * Assert that a JWT token is malformed
 */
export function expectMalformedJWT(token: string, secret: string) {
  expect(() => {
    jwt.verify(token, secret);
  }).toThrow();
}

/**
 * Assert that a 2FA secret is properly encrypted
 */
export function expectEncrypted2FASecret(encryptedSecret: string) {
  expect(encryptedSecret).toBeDefined();
  expect(typeof encryptedSecret).toBe('string');
  expect(encryptedSecret.length).toBeGreaterThan(0);

  // Should contain version prefix and encrypted data
  expect(encryptedSecret).toMatch(/^v\d+:/);

  // Should not be the original secret
  expect(encryptedSecret).not.toMatch(/^[A-Z2-7]{32}$/); // Base32 format
}

/**
 * Assert that passkey data has the correct structure
 */
export function expectValidPasskeyData(passkey: any) {
  expect(passkey).toHaveProperty('id');
  expect(passkey).toHaveProperty('userId');
  expect(passkey).toHaveProperty('credentialId');
  expect(passkey).toHaveProperty('publicKey');
  expect(passkey).toHaveProperty('counter');
  expect(passkey).toHaveProperty('name');
  expect(passkey).toHaveProperty('createdAt');

  expect(typeof passkey.id).toBe('string');
  expect(typeof passkey.userId).toBe('string');
  expect(typeof passkey.credentialId).toBe('string');
  expect(typeof passkey.publicKey).toBe('string');
  expect(typeof passkey.counter).toBe('number');
  expect(typeof passkey.name).toBe('string');
  expect(passkey.createdAt).toBeInstanceOf(Date);

  expect(passkey.counter).toBeGreaterThanOrEqual(0);
}

/**
 * Assert that WebAuthn challenge options have the correct structure
 */
export function expectValidWebAuthnChallenge(options: any) {
  expect(options).toHaveProperty('challenge');
  expect(options).toHaveProperty('rp');
  expect(options).toHaveProperty('user');
  expect(options).toHaveProperty('pubKeyCredParams');
  expect(options).toHaveProperty('timeout');

  expect(typeof options.challenge).toBe('string');
  expect(options.challenge.length).toBeGreaterThan(0);

  expect(options.rp).toHaveProperty('name');
  expect(options.rp).toHaveProperty('id');

  expect(options.user).toHaveProperty('id');
  expect(options.user).toHaveProperty('name');
  expect(options.user).toHaveProperty('displayName');

  expect(Array.isArray(options.pubKeyCredParams)).toBe(true);
  expect(options.pubKeyCredParams.length).toBeGreaterThan(0);

  expect(typeof options.timeout).toBe('number');
  expect(options.timeout).toBeGreaterThan(0);
}

/**
 * Assert that rate limiting is working correctly
 */
export function expectRateLimitHeaders(response: any, expected: {
  limit?: number;
  remaining?: number;
  reset?: number;
}) {
  if (expected.limit) {
    expect(response.headers).toHaveProperty('x-ratelimit-limit');
    expect(parseInt(response.headers['x-ratelimit-limit'])).toBe(expected.limit);
  }

  if (expected.remaining !== undefined) {
    expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    expect(parseInt(response.headers['x-ratelimit-remaining'])).toBe(expected.remaining);
  }

  if (expected.reset) {
    expect(response.headers).toHaveProperty('x-ratelimit-reset');
    expect(parseInt(response.headers['x-ratelimit-reset'])).toBeGreaterThan(0);
  }
}

/**
 * Assert that rate limiting is triggered
 */
export function expectRateLimitExceeded(response: any) {
  expect(response.status).toBe(429);
  expect(response.body).toHaveProperty('message');
  expect(response.body.message).toContain('Too many');
}

/**
 * Assert that cleanup operations worked correctly
 */
export function expectCleanupResults(results: any, expected: {
  deletedTokens?: number;
  deletedSessions?: number;
  errors?: number;
}) {
  expect(results).toHaveProperty('success');
  expect(results.success).toBe(true);

  if (expected.deletedTokens !== undefined) {
    expect(results).toHaveProperty('deletedTokens');
    expect(results.deletedTokens).toBe(expected.deletedTokens);
  }

  if (expected.deletedSessions !== undefined) {
    expect(results).toHaveProperty('deletedSessions');
    expect(results.deletedSessions).toBe(expected.deletedSessions);
  }

  if (expected.errors !== undefined) {
    expect(results).toHaveProperty('errors');
    expect(results.errors).toBe(expected.errors);
  }
}

/**
 * Assert that validation errors have the correct structure
 */
export function expectValidationError(error: any, field?: string) {
  expect(error).toHaveProperty('message');
  expect(error.message).toContain('validation');

  if (field) {
    expect(error.message).toContain(field);
  }

  // Should not expose sensitive internal information
  expect(error.message).not.toContain('password');
  expect(error.message).not.toContain('secret');
  expect(error.message).not.toContain('token');
}

/**
 * Assert that encrypted data has the correct format
 */
export function expectValidEncryptedData(encryptedData: string) {
  expect(encryptedData).toBeDefined();
  expect(typeof encryptedData).toBe('string');
  expect(encryptedData.length).toBeGreaterThan(0);

  // Should contain version prefix
  expect(encryptedData).toMatch(/^v\d+:/);

  // Should contain base64-encoded data after the version
  const [version, data] = encryptedData.split(':', 2);
  expect(version).toMatch(/^v\d+$/);
  expect(data).toBeDefined();
  expect(data.length).toBeGreaterThan(0);

  // Should be valid base64
  expect(() => Buffer.from(data, 'base64')).not.toThrow();
}

/**
 * Assert that a user object has the safe structure (no sensitive data)
 */
export function expectSafeUserObject(user: any) {
  expect(user).toHaveProperty('id');
  expect(user).toHaveProperty('email');
  expect(user).toHaveProperty('twoFactorEnabled');
  expect(user).toHaveProperty('createdAt');
  expect(user).toHaveProperty('updatedAt');

  // Should not expose sensitive data
  expect(user).not.toHaveProperty('hashedPassword');
  expect(user).not.toHaveProperty('twoFactorSecret');

  expect(typeof user.id).toBe('string');
  expect(typeof user.email).toBe('string');
  expect(typeof user.twoFactorEnabled).toBe('boolean');
}

/**
 * Assertion utilities for Express middleware testing
 */
export const MiddlewareAssertions = {
  expectAuthenticatedRequest: (req: any) => {
    expect(req).toHaveProperty('user');
    expect(req.user).toHaveProperty('userId');
    expect(typeof req.user.userId).toBe('string');
  },

  expectUnauthenticatedRequest: (req: any) => {
    expect(req).not.toHaveProperty('user');
  },

  expectNextCalled: (next: jest.Mock) => {
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // Called without arguments
  },

  expectNextCalledWithError: (next: jest.Mock, errorMessage?: string) => {
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Error));

    if (errorMessage) {
      const error = next.mock.calls[0][0];
      expect(error.message).toContain(errorMessage);
    }
  },

  expectResponseStatus: (res: any, status: number) => {
    expect(res.status).toHaveBeenCalledWith(status);
  },

  expectResponseJson: (res: any, data: any) => {
    expect(res.json).toHaveBeenCalledWith(data);
  },
};

/**
 * Utilities for testing async operations and timing
 */
export const AsyncAssertions = {
  expectEventuallyTrue: async (condition: () => boolean, timeout: number = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Condition never became true within ${timeout}ms`);
  },

  expectRejects: async (promise: Promise<any>, errorMessage?: string) => {
    let error: Error | null = null;
    try {
      await promise;
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    if (errorMessage) {
      expect(error!.message).toContain(errorMessage);
    }
  },

  expectResolves: async (promise: Promise<any>) => {
    let error: Error | null = null;
    let result: any = null;

    try {
      result = await promise;
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeNull();
    return result;
  },
};