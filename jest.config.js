module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test-*.ts',
  ],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Performance optimizations
  maxWorkers: '50%', // Use 50% of available cores for parallel execution

  // Coverage reporting configuration
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },

  // Cache configuration for better performance
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',

  // Clear mocks between tests for better isolation
  clearMocks: true,
  restoreMocks: true,

  // Verbose output for debugging
  verbose: false,

  // Collect coverage only when needed
  collectCoverage: process.env.CI === 'true' || process.argv.includes('--coverage'),
};