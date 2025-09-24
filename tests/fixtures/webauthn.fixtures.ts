/**
 * WebAuthn Test Fixtures for firefun-node-auth tests
 *
 * This module provides predefined WebAuthn data including challenges,
 * credentials, and authentication responses for consistent testing.
 */

import { MockPasskey } from '../mocks/prisma.mock';

/**
 * Standard test passkey
 */
export const standardPasskey: MockPasskey = {
  id: 'passkey_standard_123',
  userId: 'user_standard_123',
  credentialId: 'credential_id_standard_base64url',
  publicKey: JSON.stringify({
    kty: 'EC',
    crv: 'P-256',
    x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
    y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
    alg: -7,
  }),
  counter: 0,
  name: 'Standard Test Device',
  createdAt: new Date('2023-01-01T00:00:00.000Z'),
};

/**
 * Test passkey with incremented counter
 */
export const passkeyWithCounter: MockPasskey = {
  id: 'passkey_counter_456',
  userId: 'user_standard_123',
  credentialId: 'credential_id_counter_base64url',
  publicKey: JSON.stringify({
    kty: 'EC',
    crv: 'P-256',
    x: 'MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4',
    y: '4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM',
    alg: -7,
  }),
  counter: 15,
  name: 'Device with Counter',
  createdAt: new Date('2023-01-02T00:00:00.000Z'),
};

/**
 * Multiple passkeys for a single user
 */
export const multiplePasskeys: MockPasskey[] = [
  {
    id: 'passkey_mobile_789',
    userId: 'user_standard_123',
    credentialId: 'credential_mobile_base64url',
    publicKey: JSON.stringify({
      kty: 'EC',
      crv: 'P-256',
      x: 'WKn-ZIGevcwGIyyrzFoZNBdaq9_TsqzGHwHitJBcBmg',
      y: 'y77as5WYZ7_E2_4J_YAQxDrqR9vfaTjomM-9K0WNGMM',
      alg: -7,
    }),
    counter: 3,
    name: 'iPhone',
    createdAt: new Date('2023-01-03T00:00:00.000Z'),
  },
  {
    id: 'passkey_laptop_012',
    userId: 'user_standard_123',
    credentialId: 'credential_laptop_base64url',
    publicKey: JSON.stringify({
      kty: 'EC',
      crv: 'P-256',
      x: 'koPbw9GcP7K2lB-zFZ9ZYfpkr1dD-oNvh0TWfgUfz3o',
      y: 'MMpk5F2VfsYCH_a7yKJdJ_iVvq7pBLSc8z_aM1wJdKo',
      alg: -7,
    }),
    counter: 7,
    name: 'MacBook Pro',
    createdAt: new Date('2023-01-04T00:00:00.000Z'),
  },
  {
    id: 'passkey_desktop_345',
    userId: 'user_standard_123',
    credentialId: 'credential_desktop_base64url',
    publicKey: JSON.stringify({
      kty: 'EC',
      crv: 'P-256',
      x: 'jJ7-WKMh-2Z4VRq-WJoH8G2GFafG5mNmjpN7r-8zG4s',
      y: 'xM8yN5f-HKZ7jA9G2cJ8Xz1qN-s4yF7kH8mJ9pL5vW3',
      alg: -7,
    }),
    counter: 12,
    name: 'Windows PC',
    createdAt: new Date('2023-01-05T00:00:00.000Z'),
  },
];

/**
 * WebAuthn registration challenge options
 */
export const registrationChallengeOptions = {
  challenge: 'Y2hhbGxlbmdlLXN0cmluZy1mb3ItdGVzdGluZw',
  rp: {
    name: 'Test App',
    id: 'localhost',
  },
  user: {
    id: 'dXNlcl9zdGFuZGFyZF8xMjM',
    name: 'standard@example.com',
    displayName: 'Standard User',
  },
  pubKeyCredParams: [
    { type: 'public-key', alg: -7 }, // ES256
    { type: 'public-key', alg: -35 }, // ES384
    { type: 'public-key', alg: -36 }, // ES512
    { type: 'public-key', alg: -257 }, // RS256
  ],
  authenticatorSelection: {
    authenticatorAttachment: 'platform',
    userVerification: 'preferred',
    residentKey: 'preferred',
    requireResidentKey: false,
  },
  timeout: 60000,
  attestation: 'none',
  excludeCredentials: [
    {
      type: 'public-key',
      id: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
    },
  ],
};

/**
 * WebAuthn authentication challenge options
 */
export const authenticationChallengeOptions = {
  challenge: 'YXV0aC1jaGFsbGVuZ2Utc3RyaW5nLWZvci10ZXN0aW5n',
  rpId: 'localhost',
  allowCredentials: [
    {
      type: 'public-key',
      id: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
    },
    {
      type: 'public-key',
      id: 'Y3JlZGVudGlhbF9tb2JpbGVfYmFzZTY0dXJs',
    },
  ],
  userVerification: 'preferred',
  timeout: 60000,
};

/**
 * Mock WebAuthn registration response
 */
export const registrationResponse = {
  id: 'Y3JlZGVudGlhbF9pZF9uZXdfYmFzZTY0dXJs',
  rawId: 'Y3JlZGVudGlhbF9pZF9uZXdfYmFzZTY0dXJs',
  type: 'public-key',
  response: {
    attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVikSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NFAAAAAwAAAAAAAAAAAAAAAAAAQChcrVnQa1UPrzAR0Ml3XFyCJZa30BKJe_WJR3iWaA3Yy8BKEgJQ2iYJKHBAQ-J4bWM6bv8pEAJCgx6H3SoI_VClAQIDJiABIVggKFytWdBrVQ-vMBHQyXdcXIIllrfQEol79YlHeJZoDdjLYCJYILjGS9O5oDL4aMOYi7z9KjjFq37I5k_rNq2qJc0lHMzs',
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdlIjoiWTJoaGJHeGxibWRsTFhOMGNtbHVaeTFtYjNJdGRHVnpkR2x1WnciLCJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJjcm9zc09yaWdpbiI6ZmFsc2V9',
  },
  clientExtensionResults: {},
};

/**
 * Mock WebAuthn authentication response
 */
export const authenticationResponse = {
  id: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
  rawId: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
  type: 'public-key',
  response: {
    authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAQ',
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiWVhWMGFDMWphR0ZzYkdWdVoyVXRjM1J5YVc1bkxXWnZjaTEwWlhOMGFXNW4iLCJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJjcm9zc09yaWdpbiI6ZmFsc2V9',
    signature: 'MEUCIQDVz_KpGKSjWRo3QS0c2JdDH3ZMOcE6_lH3_y1GJdYfyQIgKvZcfJXQ7JrGH8fUXWz5k3Q7m9E2jZrK5GX8fQ2vN7w',
    userHandle: 'dXNlcl9zdGFuZGFyZF8xMjM',
  },
  clientExtensionResults: {},
};

/**
 * Invalid WebAuthn responses for error testing
 */
export const invalidWebAuthnResponses = {
  // Missing required fields
  missingId: {
    rawId: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
    type: 'public-key',
    response: authenticationResponse.response,
  },

  missingResponse: {
    id: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
    rawId: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
    type: 'public-key',
  },

  // Invalid data types
  invalidTypes: {
    id: 123,
    rawId: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
    type: 'public-key',
    response: authenticationResponse.response,
  },

  // Malformed base64
  malformedBase64: {
    id: 'invalid-base64-data!!!',
    rawId: 'invalid-base64-data!!!',
    type: 'public-key',
    response: {
      ...authenticationResponse.response,
      authenticatorData: 'invalid-base64-data!!!',
    },
  },

  // Wrong credential type
  wrongType: {
    id: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
    rawId: 'Y3JlZGVudGlhbF9pZF9zdGFuZGFyZF9iYXNlNjR1cmw',
    type: 'password', // Should be 'public-key'
    response: authenticationResponse.response,
  },
};

/**
 * WebAuthn error scenarios
 */
export const webAuthnErrors = {
  // Timeout error
  timeout: {
    name: 'NotAllowedError',
    message: 'The operation either timed out or was not allowed.',
  },

  // User cancelled
  userCancelled: {
    name: 'NotAllowedError',
    message: 'The request is not allowed by the user agent or the platform in the current context.',
  },

  // Invalid domain
  invalidDomain: {
    name: 'SecurityError',
    message: 'The relying party ID is not a registrable domain suffix of the current domain.',
  },

  // Credential already exists
  credentialExists: {
    name: 'InvalidStateError',
    message: 'The authenticator is already registered.',
  },

  // No available authenticator
  noAuthenticator: {
    name: 'NotSupportedError',
    message: 'No available authenticator recognized any of the specified credentials.',
  },
};

/**
 * Test data for edge cases
 */
export const webAuthnEdgeCases = {
  // Very large counter value
  largeCounter: {
    ...standardPasskey,
    counter: Number.MAX_SAFE_INTEGER,
  },

  // Empty credential name
  emptyName: {
    ...standardPasskey,
    name: '',
  },

  // Very long credential name
  longName: {
    ...standardPasskey,
    name: 'A'.repeat(255),
  },

  // Special characters in name
  specialCharsName: {
    ...standardPasskey,
    name: 'Device with émojis 🔑 and symbols!@#$%',
  },
};

/**
 * Helper functions for WebAuthn testing
 */
export const WebAuthnFixtureHelpers = {
  /**
   * Create a mock registration challenge with custom options
   */
  createRegistrationChallenge: (overrides: any = {}) => {
    return {
      ...registrationChallengeOptions,
      ...overrides,
      challenge: overrides.challenge || Buffer.from(`challenge-${Date.now()}`).toString('base64url'),
    };
  },

  /**
   * Create a mock authentication challenge with custom options
   */
  createAuthenticationChallenge: (allowCredentials: string[] = []) => {
    return {
      ...authenticationChallengeOptions,
      challenge: Buffer.from(`auth-challenge-${Date.now()}`).toString('base64url'),
      allowCredentials: allowCredentials.map(id => ({
        type: 'public-key',
        id,
      })),
    };
  },

  /**
   * Create a mock passkey with custom properties
   */
  createMockPasskey: (userId: string, overrides: Partial<MockPasskey> = {}): MockPasskey => {
    return {
      id: `passkey_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      userId,
      credentialId: `credential_${Math.random().toString(36).substring(7)}`,
      publicKey: JSON.stringify({
        kty: 'EC',
        crv: 'P-256',
        x: 'example_x_coordinate',
        y: 'example_y_coordinate',
        alg: -7,
      }),
      counter: 0,
      name: 'Test Device',
      createdAt: new Date(),
      ...overrides,
    };
  },

  /**
   * Generate a valid base64url-encoded credential ID
   */
  generateCredentialId: (): string => {
    const random = Math.random().toString(36).substring(2);
    return Buffer.from(`credential_${random}`).toString('base64url');
  },

  /**
   * Generate a mock client data JSON
   */
  generateClientDataJSON: (type: 'webauthn.create' | 'webauthn.get', challenge: string) => {
    const clientData = {
      type,
      challenge,
      origin: 'http://localhost:3000',
      crossOrigin: false,
    };
    return Buffer.from(JSON.stringify(clientData)).toString('base64url');
  },

  /**
   * Get passkeys for a specific user
   */
  getPasskeysForUser: (userId: string): MockPasskey[] => {
    return [standardPasskey, passkeyWithCounter, ...multiplePasskeys].filter(
      passkey => passkey.userId === userId
    );
  },

  /**
   * Validate WebAuthn response structure
   */
  isValidWebAuthnResponse: (response: any): boolean => {
    return (
      response &&
      typeof response.id === 'string' &&
      typeof response.rawId === 'string' &&
      response.type === 'public-key' &&
      response.response &&
      typeof response.response === 'object'
    );
  },
};

/**
 * WebAuthn verification results for testing
 */
export const webAuthnVerificationResult = {
  verified: true,
  registrationInfo: {
    credentialID: Buffer.from('credential_id_standard_base64url'),
    credentialPublicKey: Buffer.from(JSON.stringify({
      kty: 'EC',
      crv: 'P-256',
      x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
      y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
      alg: -7,
    })),
    counter: 0,
  },
};

export const webAuthnAuthVerificationResult = {
  verified: true,
  authenticationInfo: {
    newCounter: 1,
  },
};

/**
 * Combined WebAuthn fixtures export for easy importing
 */
export const webAuthnFixtures = {
  registrationOptions: registrationChallengeOptions,
  authenticationOptions: authenticationChallengeOptions,
  verificationResult: webAuthnVerificationResult,
  authVerificationResult: webAuthnAuthVerificationResult,
  registrationResponse,
  authenticationResponse,
  standardPasskey,
  passkeyWithCounter,
  multiplePasskeys,
  invalidResponses: invalidWebAuthnResponses,
  errors: webAuthnErrors,
  edgeCases: webAuthnEdgeCases,
  helpers: WebAuthnFixtureHelpers,
};