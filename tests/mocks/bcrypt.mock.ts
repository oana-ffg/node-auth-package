/**
 * Mock implementation for bcrypt library
 * Used for testing password hashing and verification functionality
 */

export interface BCryptMockConfig {
  hashResult?: string;
  compareResult?: boolean;
  saltRounds?: number;
  hashError?: Error;
  compareError?: Error;
  genSaltError?: Error;
}

export class BCryptMock {
  private config: BCryptMockConfig;
  private static instance: BCryptMock;
  private hashCallCount = 0;
  private compareCallCount = 0;

  constructor(config: BCryptMockConfig = {}) {
    this.config = {
      hashResult: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      compareResult: true,
      saltRounds: 10,
      ...config
    };
  }

  static getInstance(config?: BCryptMockConfig): BCryptMock {
    if (!BCryptMock.instance) {
      BCryptMock.instance = new BCryptMock(config);
    }
    if (config) {
      BCryptMock.instance.updateConfig(config);
    }
    return BCryptMock.instance;
  }

  updateConfig(config: Partial<BCryptMockConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.config = {
      hashResult: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
      compareResult: true,
      saltRounds: 10
    };
    this.hashCallCount = 0;
    this.compareCallCount = 0;
  }

  getCallCounts(): { hash: number; compare: number } {
    return {
      hash: this.hashCallCount,
      compare: this.compareCallCount
    };
  }

  // Mock the hash function (async)
  hash = jest.fn().mockImplementation(async (data: string | Buffer, saltOrRounds: string | number): Promise<string> => {
    this.hashCallCount++;

    if (this.config.hashError) {
      throw this.config.hashError;
    }

    // Simulate different hashing scenarios
    if (data === 'INVALID_PASSWORD') {
      throw new Error('Invalid password format');
    }

    if (data === '') {
      throw new Error('Data must not be empty');
    }

    // Generate a predictable but realistic hash based on input
    const inputStr = typeof data === 'string' ? data : data.toString();
    const rounds = typeof saltOrRounds === 'number' ? saltOrRounds : this.config.saltRounds!;

    // Create a deterministic hash for testing
    const hash = `$2b$${rounds.toString().padStart(2, '0')}$${inputStr.slice(0, 22).padEnd(22, 'x')}${inputStr.length.toString().padStart(31, '0')}`;

    return this.config.hashResult || hash;
  });

  // Mock the hashSync function (sync)
  hashSync = jest.fn().mockImplementation((data: string | Buffer, saltOrRounds: string | number): string => {
    this.hashCallCount++;

    if (this.config.hashError) {
      throw this.config.hashError;
    }

    if (data === 'INVALID_PASSWORD') {
      throw new Error('Invalid password format');
    }

    if (data === '') {
      throw new Error('Data must not be empty');
    }

    const inputStr = typeof data === 'string' ? data : data.toString();
    const rounds = typeof saltOrRounds === 'number' ? saltOrRounds : this.config.saltRounds!;

    const hash = `$2b$${rounds.toString().padStart(2, '0')}$${inputStr.slice(0, 22).padEnd(22, 'x')}${inputStr.length.toString().padStart(31, '0')}`;

    return this.config.hashResult || hash;
  });

  // Mock the compare function (async)
  compare = jest.fn().mockImplementation(async (data: string | Buffer, encrypted: string): Promise<boolean> => {
    this.compareCallCount++;

    if (this.config.compareError) {
      throw this.config.compareError;
    }

    // Simulate different comparison scenarios
    if (encrypted === 'INVALID_HASH') {
      throw new Error('Invalid hash format');
    }

    if (data === 'INVALID_PASSWORD') {
      return false;
    }

    // Special test cases
    if (data === 'correct_password' && encrypted.includes('correct_password')) {
      return true;
    }

    if (data === 'wrong_password') {
      return false;
    }

    if (data === 'testpassword123' && encrypted === '$2b$10$testpassword123xxxxxx00000000000000000000000000000015') {
      return true;
    }

    return this.config.compareResult!;
  });

  // Mock the compareSync function (sync)
  compareSync = jest.fn().mockImplementation((data: string | Buffer, encrypted: string): boolean => {
    this.compareCallCount++;

    if (this.config.compareError) {
      throw this.config.compareError;
    }

    if (encrypted === 'INVALID_HASH') {
      throw new Error('Invalid hash format');
    }

    if (data === 'INVALID_PASSWORD') {
      return false;
    }

    // Special test cases
    if (data === 'correct_password' && encrypted.includes('correct_password')) {
      return true;
    }

    if (data === 'wrong_password') {
      return false;
    }

    if (data === 'testpassword123' && encrypted === '$2b$10$testpassword123xxxxxx00000000000000000000000000000015') {
      return true;
    }

    return this.config.compareResult!;
  });

  // Mock the genSalt function (async)
  genSalt = jest.fn().mockImplementation(async (rounds?: number): Promise<string> => {
    if (this.config.genSaltError) {
      throw this.config.genSaltError;
    }

    const saltRounds = rounds || this.config.saltRounds!;

    if (saltRounds < 1 || saltRounds > 31) {
      throw new Error('Invalid salt rounds');
    }

    return `$2b$${saltRounds.toString().padStart(2, '0')}$abcdefghijklmnopqrstuv`;
  });

  // Mock the genSaltSync function (sync)
  genSaltSync = jest.fn().mockImplementation((rounds?: number): string => {
    if (this.config.genSaltError) {
      throw this.config.genSaltError;
    }

    const saltRounds = rounds || this.config.saltRounds!;

    if (saltRounds < 1 || saltRounds > 31) {
      throw new Error('Invalid salt rounds');
    }

    return `$2b$${saltRounds.toString().padStart(2, '0')}$abcdefghijklmnopqrstuv`;
  });

  // Mock the getRounds function
  getRounds = jest.fn().mockImplementation((encrypted: string): number => {
    if (!encrypted || !encrypted.startsWith('$2b$')) {
      throw new Error('Invalid hash format');
    }

    const rounds = parseInt(encrypted.substring(4, 6), 10);
    if (isNaN(rounds)) {
      throw new Error('Invalid hash format');
    }

    return rounds;
  });
}

// Create the default mock instance
const bcryptMock = BCryptMock.getInstance();

// Export individual functions to match bcrypt's export pattern
export const hash = bcryptMock.hash;
export const hashSync = bcryptMock.hashSync;
export const compare = bcryptMock.compare;
export const compareSync = bcryptMock.compareSync;
export const genSalt = bcryptMock.genSalt;
export const genSaltSync = bcryptMock.genSaltSync;
export const getRounds = bcryptMock.getRounds;

// Export default
export default bcryptMock;

// Mock the module
jest.mock('bcrypt', () => ({
  __esModule: true,
  default: bcryptMock,
  hash: bcryptMock.hash,
  hashSync: bcryptMock.hashSync,
  compare: bcryptMock.compare,
  compareSync: bcryptMock.compareSync,
  genSalt: bcryptMock.genSalt,
  genSaltSync: bcryptMock.genSaltSync,
  getRounds: bcryptMock.getRounds,
}));

// Helper functions for test setup
export const setupBCryptMock = (config?: BCryptMockConfig): BCryptMock => {
  const mock = BCryptMock.getInstance(config);
  mock.reset();
  if (config) {
    mock.updateConfig(config);
  }
  return mock;
};

// Common test scenarios
export const bcryptTestScenarios = {
  validHashing: {
    hashResult: '$2b$10$validhashresultxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  },
  hashingError: {
    hashError: new Error('Hashing failed')
  },
  validComparison: {
    compareResult: true
  },
  invalidComparison: {
    compareResult: false
  },
  comparisonError: {
    compareError: new Error('Comparison failed')
  },
  saltGenerationError: {
    genSaltError: new Error('Salt generation failed')
  }
};

// Export the mock instance for direct manipulation in tests
export { bcryptMock };