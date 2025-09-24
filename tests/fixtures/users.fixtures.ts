/**
 * User Test Fixtures for firefun-node-auth tests
 *
 * This module provides predefined user data for consistent testing
 * across different test suites.
 */

import { MockUser } from '../mocks/prisma.mock';

/**
 * Standard test user without 2FA
 */
export const standardUser: MockUser = {
  id: 'user_standard_123',
  email: 'standard@example.com',
  hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm', // 'testPassword123!'
  twoFactorSecret: null,
  twoFactorEnabled: false,
  createdAt: new Date('2023-01-01T00:00:00.000Z'),
  updatedAt: new Date('2023-01-01T00:00:00.000Z'),
};

/**
 * Test user with 2FA enabled
 */
export const userWith2FA: MockUser = {
  id: 'user_2fa_456',
  email: '2fa@example.com',
  hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm', // 'testPassword123!'
  twoFactorSecret: 'v1:encrypted_2fa_secret_data_here_base64_encoded',
  twoFactorEnabled: true,
  createdAt: new Date('2023-01-01T00:00:00.000Z'),
  updatedAt: new Date('2023-01-02T00:00:00.000Z'),
};

/**
 * Test user with special characters in email
 */
export const userWithSpecialEmail: MockUser = {
  id: 'user_special_789',
  email: 'test+tag@sub.domain.co.uk',
  hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm',
  twoFactorSecret: null,
  twoFactorEnabled: false,
  createdAt: new Date('2023-01-01T00:00:00.000Z'),
  updatedAt: new Date('2023-01-01T00:00:00.000Z'),
};

/**
 * Test user with very long email
 */
export const userWithLongEmail: MockUser = {
  id: 'user_long_012',
  email: 'verylongemailaddressthatexceedsnormallengthexpectations@example.com',
  hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm',
  twoFactorSecret: null,
  twoFactorEnabled: false,
  createdAt: new Date('2023-01-01T00:00:00.000Z'),
  updatedAt: new Date('2023-01-01T00:00:00.000Z'),
};

/**
 * Recently created user
 */
export const recentUser: MockUser = {
  id: 'user_recent_345',
  email: 'recent@example.com',
  hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm',
  twoFactorSecret: null,
  twoFactorEnabled: false,
  createdAt: new Date(), // Now
  updatedAt: new Date(),
};

/**
 * Old user for testing data migration or cleanup
 */
export const oldUser: MockUser = {
  id: 'user_old_678',
  email: 'old@example.com',
  hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm',
  twoFactorSecret: null,
  twoFactorEnabled: false,
  createdAt: new Date('2020-01-01T00:00:00.000Z'),
  updatedAt: new Date('2020-01-01T00:00:00.000Z'),
};

/**
 * Array of multiple test users for batch operations
 */
export const multipleUsers: MockUser[] = [
  {
    id: 'user_batch_001',
    email: 'batch1@example.com',
    hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm',
    twoFactorSecret: null,
    twoFactorEnabled: false,
    createdAt: new Date('2023-01-01T00:00:00.000Z'),
    updatedAt: new Date('2023-01-01T00:00:00.000Z'),
  },
  {
    id: 'user_batch_002',
    email: 'batch2@example.com',
    hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm',
    twoFactorSecret: 'v1:encrypted_secret_batch2',
    twoFactorEnabled: true,
    createdAt: new Date('2023-01-02T00:00:00.000Z'),
    updatedAt: new Date('2023-01-02T00:00:00.000Z'),
  },
  {
    id: 'user_batch_003',
    email: 'batch3@example.com',
    hashedPassword: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGQKQTruaO.nC7Dm',
    twoFactorSecret: null,
    twoFactorEnabled: false,
    createdAt: new Date('2023-01-03T00:00:00.000Z'),
    updatedAt: new Date('2023-01-03T00:00:00.000Z'),
  },
];

/**
 * Invalid user data for testing validation
 */
export const invalidUsers = {
  // Missing required fields
  missingEmail: {
    password: 'TestPassword123!',
  },
  missingPassword: {
    email: 'test@example.com',
  },
  empty: {},

  // Invalid email formats
  invalidEmails: [
    { email: 'not-an-email', password: 'TestPassword123!' },
    { email: 'test@', password: 'TestPassword123!' },
    { email: '@example.com', password: 'TestPassword123!' },
    { email: 'test..test@example.com', password: 'TestPassword123!' },
    { email: 'test@.example.com', password: 'TestPassword123!' },
    { email: 'test@example.', password: 'TestPassword123!' },
    { email: 'test@exam ple.com', password: 'TestPassword123!' },
    { email: '', password: 'TestPassword123!' },
  ],

  // Invalid passwords
  invalidPasswords: [
    { email: 'test@example.com', password: 'short' }, // Too short
    { email: 'test@example.com', password: 'onlylowercase123!' }, // No uppercase
    { email: 'test@example.com', password: 'ONLYUPPERCASE123!' }, // No lowercase
    { email: 'test@example.com', password: 'NoNumbers!' }, // No numbers
    { email: 'test@example.com', password: 'NoSpecialChars123' }, // No special chars
    { email: 'test@example.com', password: 'Short1!' }, // Too short overall
    { email: 'test@example.com', password: '' }, // Empty
  ],

  // Invalid data types
  invalidTypes: [
    { email: 123, password: 'TestPassword123!' }, // Email as number
    { email: 'test@example.com', password: 123 }, // Password as number
    { email: null, password: 'TestPassword123!' }, // Email as null
    { email: 'test@example.com', password: null }, // Password as null
    { email: ['test@example.com'], password: 'TestPassword123!' }, // Email as array
    { email: 'test@example.com', password: ['TestPassword123!'] }, // Password as array
  ],
};

/**
 * User credentials for testing authentication
 */
export const userCredentials = {
  standard: {
    email: standardUser.email,
    password: 'testPassword123!', // Plain text password for login tests
  },

  with2FA: {
    email: userWith2FA.email,
    password: 'testPassword123!',
    totpCode: '123456', // Mock TOTP code
  },

  nonExistent: {
    email: 'nonexistent@example.com',
    password: 'testPassword123!',
  },

  wrongPassword: {
    email: standardUser.email,
    password: 'wrongPassword123!',
  },
};

/**
 * Helper functions for user-related tests
 */
export const UserFixtureHelpers = {
  /**
   * Get a user by ID from test fixtures
   */
  getUserById: (id: string): MockUser | undefined => {
    const allUsers = [standardUser, userWith2FA, userWithSpecialEmail, userWithLongEmail, recentUser, oldUser, ...multipleUsers];
    return allUsers.find(user => user.id === id);
  },

  /**
   * Get a user by email from test fixtures
   */
  getUserByEmail: (email: string): MockUser | undefined => {
    const allUsers = [standardUser, userWith2FA, userWithSpecialEmail, userWithLongEmail, recentUser, oldUser, ...multipleUsers];
    return allUsers.find(user => user.email === email);
  },

  /**
   * Get all users with 2FA enabled
   */
  getUsersWith2FA: (): MockUser[] => {
    const allUsers = [standardUser, userWith2FA, userWithSpecialEmail, userWithLongEmail, recentUser, oldUser, ...multipleUsers];
    return allUsers.filter(user => user.twoFactorEnabled);
  },

  /**
   * Get all users without 2FA
   */
  getUsersWithout2FA: (): MockUser[] => {
    const allUsers = [standardUser, userWith2FA, userWithSpecialEmail, userWithLongEmail, recentUser, oldUser, ...multipleUsers];
    return allUsers.filter(user => !user.twoFactorEnabled);
  },

  /**
   * Create a user variant with overrides
   */
  createUserVariant: (baseUser: MockUser, overrides: Partial<MockUser>): MockUser => {
    return { ...baseUser, ...overrides };
  },

  /**
   * Get safe user data (without sensitive fields)
   */
  getSafeUserData: (user: MockUser) => {
    const { hashedPassword, twoFactorSecret, ...safeData } = user;
    return safeData;
  },
};