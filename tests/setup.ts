/**
 * Jest setup file for firefun-node-auth tests
 */

// Set test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Only show errors and warnings during tests
  console.log = jest.fn();
  console.error = originalConsoleError;
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Export useful test utilities
export const testConfig = {
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
    keys: {
      v1: 'test-encryption-key-at-least-32-characters-long',
    },
    currentVersion: 'v1',
  },
  webauthn: {
    rpName: 'Test App',
    rpId: 'localhost',
    origin: 'http://localhost:3000',
  },
  rateLimiting: {
    general: { windowMs: 900000, maxRequests: 100, message: 'Too many requests' },
    auth: { windowMs: 900000, maxRequests: 5, message: 'Too many auth attempts' },
    twoFA: { windowMs: 900000, maxRequests: 3, message: 'Too many 2FA attempts' },
  },
  prisma: {} as any, // Mock prisma client
  serverless: true,
};