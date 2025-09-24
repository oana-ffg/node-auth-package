/**
 * Jest setup file for firefun-node-auth tests
 */

// Set test timeout (reduced from 10s to 8s for better performance)
jest.setTimeout(8000);

// Mock console methods to reduce noise during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Only show errors in tests (suppress logs and warnings for cleaner output)
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = originalConsoleError;

  // Set NODE_ENV to test for consistent behavior
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities for performance monitoring
global.testPerformanceStart = () => performance.now();
global.testPerformanceEnd = (startTime: number, testName?: string) => {
  const duration = performance.now() - startTime;
  if (duration > 1000) { // Log slow tests (>1s)
    console.warn(`⚠️  Slow test detected${testName ? `: ${testName}` : ''} (${duration.toFixed(2)}ms)`);
  }
  return duration;
};

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