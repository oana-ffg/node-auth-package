/**
 * Enhanced Prisma Client Mock for firefun-node-auth tests
 *
 * This mock provides realistic database interactions for testing
 * without requiring an actual database connection.
 */

// Mock user data structure
export interface MockUser {
  id: string;
  email: string;
  hashedPassword: string;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  encryptionVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Mock passkey data structure
export interface MockPasskey {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  name: string;
  createdAt: Date;
}

// Mock refresh token structure
export interface MockRefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

// Mock challenge structure
export interface MockChallenge {
  id: string;
  challenge: string;
  userId?: string;
  email?: string;
  type: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Enhanced mock Prisma client with realistic data operations
 */
export class MockPrismaClient {
  private users: MockUser[] = [];
  private passkeys: MockPasskey[] = [];
  private refreshTokens: MockRefreshToken[] = [];
  private challenges: MockChallenge[] = [];

  // User operations
  user = {
    findUnique: jest.fn(async (args: any) => {
      const { where, include } = args;

      let user = null;
      if (where.id) {
        user = this.users.find(user => user.id === where.id) || null;
      } else if (where.email) {
        user = this.users.find(user => user.email === where.email) || null;
      }

      if (!user) return null;

      // Handle includes
      if (include?.passkeys) {
        const userPasskeys = this.passkeys.filter(passkey => passkey.userId === user.id);
        return { ...user, passkeys: userPasskeys };
      }

      return user;
    }),

    create: jest.fn(async (args: any) => {
      const { data } = args;
      const newUser: MockUser = {
        id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        email: data.email,
        hashedPassword: data.password || data.hashedPassword,
        twoFactorSecret: data.twoFactorSecret || null,
        twoFactorEnabled: data.twoFactorEnabled || false,
        encryptionVersion: data.encryptionVersion || 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.users.push(newUser);
      return newUser;
    }),

    update: jest.fn(async (args: any) => {
      const { where, data } = args;
      const userIndex = this.users.findIndex(user => user.id === where.id);

      if (userIndex === -1) {
        // Try to find user using the mocked findUnique method
        const existingUser = await this.user.findUnique({ where });
        if (existingUser) {
          // User exists in mock but not in internal array, add it
          const updatedUser = {
            ...existingUser,
            ...data,
            updatedAt: new Date(),
          };
          this.users.push(updatedUser);
          return updatedUser;
        }
        throw new Error('User not found');
      }

      this.users[userIndex] = {
        ...this.users[userIndex],
        ...data,
        updatedAt: new Date(),
      };

      return this.users[userIndex];
    }),

    delete: jest.fn(async (args: any) => {
      const { where } = args;
      const userIndex = this.users.findIndex(user => user.id === where.id);

      if (userIndex === -1) {
        throw new Error('User not found');
      }

      const deletedUser = this.users[userIndex];
      this.users.splice(userIndex, 1);

      // Also delete related data
      this.passkeys = this.passkeys.filter(passkey => passkey.userId !== where.id);
      this.refreshTokens = this.refreshTokens.filter(token => token.userId !== where.id);

      return deletedUser;
    }),
  };

  // Passkey operations
  passkey = {
    findMany: jest.fn(async (args: any) => {
      const { where, select, orderBy } = args;

      let passkeys = this.passkeys;

      if (where?.userId) {
        passkeys = passkeys.filter(passkey => passkey.userId === where.userId);
      }

      // Handle ordering
      if (orderBy?.createdAt === 'desc') {
        passkeys = [...passkeys].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }

      // Handle select
      if (select) {
        return passkeys.map(passkey => {
          const result: any = {};
          Object.keys(select).forEach(key => {
            if (select[key] && passkey.hasOwnProperty(key)) {
              result[key] = (passkey as any)[key];
            }
          });
          // Add missing fields with default values
          if (select.deviceType && !result.deviceType) result.deviceType = 'single_device';
          if (select.backedUp && !result.backedUp) result.backedUp = false;
          if (select.transports && !result.transports) result.transports = ['internal'];
          if (select.lastUsed && !result.lastUsed) result.lastUsed = null;
          return result;
        });
      }

      return passkeys;
    }),

    findUnique: jest.fn(async (args: any) => {
      const { where, include } = args;

      let passkey = null;
      if (where.id) {
        passkey = this.passkeys.find(passkey => passkey.id === where.id) || null;
      } else if (where.credentialId) {
        passkey = this.passkeys.find(passkey => passkey.credentialId === where.credentialId) || null;
      }

      if (!passkey) return null;

      // Handle includes
      if (include?.user) {
        const user = this.users.find(user => user.id === passkey.userId);
        return { ...passkey, user };
      }

      return passkey;
    }),

    findFirst: jest.fn(async (args: any) => {
      const { where } = args;

      if (where?.id && where?.userId) {
        return this.passkeys.find(passkey => passkey.id === where.id && passkey.userId === where.userId) || null;
      }

      return null;
    }),

    create: jest.fn(async (args: any) => {
      const { data } = args;
      const newPasskey: MockPasskey = {
        id: `passkey_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: data.userId,
        credentialId: data.credentialId,
        publicKey: data.publicKey,
        counter: data.counter || 0,
        name: data.name || 'Untitled Passkey',
        createdAt: new Date(),
      };

      this.passkeys.push(newPasskey);
      return newPasskey;
    }),

    update: jest.fn(async (args: any) => {
      const { where, data, select } = args;
      const passkeyIndex = this.passkeys.findIndex(passkey => passkey.id === where.id);

      if (passkeyIndex === -1) {
        throw new Error('Passkey not found');
      }

      this.passkeys[passkeyIndex] = {
        ...this.passkeys[passkeyIndex],
        ...data,
      };

      const updatedPasskey = this.passkeys[passkeyIndex];

      // Handle select
      if (select) {
        const result: any = {};
        Object.keys(select).forEach(key => {
          if (select[key] && updatedPasskey.hasOwnProperty(key)) {
            result[key] = (updatedPasskey as any)[key];
          }
        });
        // Add missing fields with default values
        if (select.deviceType && !result.deviceType) result.deviceType = 'single_device';
        if (select.backedUp && !result.backedUp) result.backedUp = false;
        if (select.transports && !result.transports) result.transports = ['internal'];
        if (select.lastUsed && !result.lastUsed) result.lastUsed = null;
        return result;
      }

      return updatedPasskey;
    }),

    delete: jest.fn(async (args: any) => {
      const { where } = args;
      const passkeyIndex = this.passkeys.findIndex(passkey => passkey.id === where.id);

      if (passkeyIndex === -1) {
        throw new Error('Passkey not found');
      }

      const deletedPasskey = this.passkeys[passkeyIndex];
      this.passkeys.splice(passkeyIndex, 1);
      return deletedPasskey;
    }),
  };

  // Refresh token operations
  refreshToken = {
    findMany: jest.fn(async (args: any) => {
      const { where } = args;

      if (where?.userId) {
        return this.refreshTokens.filter(token => token.userId === where.userId);
      }

      if (where?.expiresAt) {
        // Handle date filtering for cleanup operations
        const expiredTokens = this.refreshTokens.filter(token => {
          if (where.expiresAt.lt) {
            return token.expiresAt < where.expiresAt.lt;
          }
          return true;
        });
        return expiredTokens;
      }

      return this.refreshTokens;
    }),

    findUnique: jest.fn(async (args: any) => {
      const { where } = args;

      if (where.token) {
        return this.refreshTokens.find(token => token.token === where.token) || null;
      }

      return null;
    }),

    create: jest.fn(async (args: any) => {
      const { data } = args;
      const newToken: MockRefreshToken = {
        id: `token_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      };

      this.refreshTokens.push(newToken);
      return newToken;
    }),

    deleteMany: jest.fn(async (args: any) => {
      const { where } = args;
      let deletedCount = 0;

      if (where?.userId) {
        const initialLength = this.refreshTokens.length;
        this.refreshTokens = this.refreshTokens.filter(token => token.userId !== where.userId);
        deletedCount = initialLength - this.refreshTokens.length;
      } else if (where?.expiresAt) {
        // Handle cleanup of expired tokens
        const initialLength = this.refreshTokens.length;
        this.refreshTokens = this.refreshTokens.filter(token => {
          if (where.expiresAt.lt) {
            return token.expiresAt >= where.expiresAt.lt;
          }
          return true;
        });
        deletedCount = initialLength - this.refreshTokens.length;
      }

      return { count: deletedCount };
    }),

    delete: jest.fn(async (args: any) => {
      const { where } = args;
      const tokenIndex = this.refreshTokens.findIndex(token => token.token === where.token);

      if (tokenIndex === -1) {
        throw new Error('Token not found');
      }

      const deletedToken = this.refreshTokens[tokenIndex];
      this.refreshTokens.splice(tokenIndex, 1);
      return deletedToken;
    }),
  };

  // Challenge operations
  challenge = {
    findUnique: jest.fn(async (args: any) => {
      const { where } = args;

      if (where.challenge) {
        return this.challenges.find(challenge => challenge.challenge === where.challenge) || null;
      }

      if (where.id) {
        return this.challenges.find(challenge => challenge.id === where.id) || null;
      }

      return null;
    }),

    create: jest.fn(async (args: any) => {
      const { data } = args;
      const newChallenge: MockChallenge = {
        id: `challenge_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        challenge: data.challenge,
        userId: data.userId || null,
        email: data.email || null,
        type: data.type,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      };

      this.challenges.push(newChallenge);
      return newChallenge;
    }),

    delete: jest.fn(async (args: any) => {
      const { where } = args;
      const challengeIndex = this.challenges.findIndex(challenge =>
        challenge.id === where.id || challenge.challenge === where.challenge
      );

      if (challengeIndex === -1) {
        throw new Error('Challenge not found');
      }

      const deletedChallenge = this.challenges[challengeIndex];
      this.challenges.splice(challengeIndex, 1);
      return deletedChallenge;
    }),

    deleteMany: jest.fn(async (args: any) => {
      const { where } = args;
      let deletedCount = 0;

      if (where?.expiresAt) {
        // Handle cleanup of expired challenges
        const initialLength = this.challenges.length;
        this.challenges = this.challenges.filter(challenge => {
          if (where.expiresAt.lt) {
            return challenge.expiresAt >= where.expiresAt.lt;
          }
          return true;
        });
        deletedCount = initialLength - this.challenges.length;
      }

      return { count: deletedCount };
    }),
  };

  // Transaction operations
  $transaction = jest.fn(async (operations: any) => {
    // Handle both callback-style and array-style transactions
    if (typeof operations === 'function') {
      // Callback-style transaction
      const tx = {
        user: {
          findUnique: jest.fn(),
          delete: jest.fn(),
        },
        passkey: {
          findMany: jest.fn(),
          delete: jest.fn(),
        },
        refreshToken: {
          deleteMany: jest.fn(),
        },
      };
      return await operations(tx);
    } else if (Array.isArray(operations)) {
      // Array-style transaction - return mock results
      return operations.map(() => ({ success: true }));
    }

    throw new Error('Invalid transaction operations');
  });

  // Utility methods for testing
  clearAllData() {
    this.users = [];
    this.passkeys = [];
    this.refreshTokens = [];
    this.challenges = [];
  }

  addMockUser(user: Partial<MockUser>): MockUser {
    const mockUser: MockUser = {
      id: user.id || `user_${Date.now()}`,
      email: user.email || 'test@example.com',
      hashedPassword: user.hashedPassword || 'hashed_password',
      twoFactorSecret: user.twoFactorSecret || null,
      twoFactorEnabled: user.twoFactorEnabled || false,
      encryptionVersion: user.encryptionVersion || 'v1',
      createdAt: user.createdAt || new Date(),
      updatedAt: user.updatedAt || new Date(),
    };

    this.users.push(mockUser);
    return mockUser;
  }

  addMockPasskey(passkey: Partial<MockPasskey>): MockPasskey {
    const mockPasskey: MockPasskey = {
      id: passkey.id || `passkey_${Date.now()}`,
      userId: passkey.userId || 'user_1',
      credentialId: passkey.credentialId || 'credential_1',
      publicKey: passkey.publicKey || 'public_key_data',
      counter: passkey.counter || 0,
      name: passkey.name || 'Test Passkey',
      createdAt: passkey.createdAt || new Date(),
    };

    this.passkeys.push(mockPasskey);
    return mockPasskey;
  }

  addMockRefreshToken(token: Partial<MockRefreshToken>): MockRefreshToken {
    const mockToken: MockRefreshToken = {
      id: token.id || `token_${Date.now()}`,
      userId: token.userId || 'user_1',
      token: token.token || 'refresh_token_value',
      expiresAt: token.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: token.createdAt || new Date(),
    };

    this.refreshTokens.push(mockToken);
    return mockToken;
  }

  // Simulate database connection errors
  simulateConnectionError() {
    const error = new Error('Database connection failed');

    // Override all methods to throw errors
    Object.values(this.user).forEach(method => {
      if (jest.isMockFunction(method)) {
        method.mockRejectedValue(error);
      }
    });

    Object.values(this.passkey).forEach(method => {
      if (jest.isMockFunction(method)) {
        method.mockRejectedValue(error);
      }
    });

    Object.values(this.refreshToken).forEach(method => {
      if (jest.isMockFunction(method)) {
        method.mockRejectedValue(error);
      }
    });

    Object.values(this.challenge).forEach(method => {
      if (jest.isMockFunction(method)) {
        method.mockRejectedValue(error);
      }
    });
  }

  // Reset all mocks
  resetMocks() {
    this.clearAllData();

    // Reset all jest mocks
    Object.values(this.user).forEach(method => {
      if (jest.isMockFunction(method)) {
        method.mockClear();
      }
    });

    Object.values(this.passkey).forEach(method => {
      if (jest.isMockFunction(method)) {
        method.mockClear();
      }
    });

    Object.values(this.refreshToken).forEach(method => {
      if (jest.isMockFunction(method)) {
        method.mockClear();
      }
    });

    Object.values(this.challenge).forEach(method => {
      if (jest.isMockFunction(method)) {
        method.mockClear();
      }
    });

    // Reset transaction mock
    if (jest.isMockFunction(this.$transaction)) {
      this.$transaction.mockClear();
    }
  }
}

// Export factory function for creating new mock instances
export function createMockPrismaClient(): MockPrismaClient {
  return new MockPrismaClient();
}

// Export singleton for tests that need shared state
export const mockPrismaClient = new MockPrismaClient();