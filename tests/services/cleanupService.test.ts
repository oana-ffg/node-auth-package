/**
 * CleanupService Test Suite
 *
 * Tests for the CleanupService class that handles cleanup of expired
 * refresh tokens and WebAuthn challenges.
 */

import { CleanupService } from '../../src/services/cleanupService';
import { MockPrismaClient, createMockPrismaClient, MockRefreshToken, MockChallenge } from '../mocks/prisma.mock';

describe('CleanupService', () => {
  let cleanupService: CleanupService;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    mockPrisma.resetMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create cleanup service in standard mode by default', () => {
      cleanupService = new CleanupService(mockPrisma as any);
      expect(cleanupService).toBeDefined();
    });

    it('should create cleanup service in serverless mode when specified', () => {
      cleanupService = new CleanupService(mockPrisma as any, true);
      expect(cleanupService).toBeDefined();
    });
  });

  describe('cleanupExpiredRefreshTokens', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(mockPrisma as any);
    });

    it('should clean up expired refresh tokens', async () => {
      // Arrange: Add some expired and non-expired tokens
      const expiredDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      mockPrisma.addMockRefreshToken({
        id: 'expired1',
        userId: 'user1',
        token: 'expired_token_1',
        expiresAt: expiredDate,
      });

      mockPrisma.addMockRefreshToken({
        id: 'expired2',
        userId: 'user2',
        token: 'expired_token_2',
        expiresAt: expiredDate,
      });

      mockPrisma.addMockRefreshToken({
        id: 'valid1',
        userId: 'user1',
        token: 'valid_token_1',
        expiresAt: futureDate,
      });

      // Act
      const result = await cleanupService.cleanupExpiredRefreshTokens();

      // Assert
      expect(result.deletedCount).toBe(2);
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should return zero when no expired tokens exist', async () => {
      // Arrange: Add only valid tokens
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);

      mockPrisma.addMockRefreshToken({
        id: 'valid1',
        userId: 'user1',
        token: 'valid_token_1',
        expiresAt: futureDate,
      });

      // Act
      const result = await cleanupService.cleanupExpiredRefreshTokens();

      // Assert
      expect(result.deletedCount).toBe(0);
    });

    it('should log successful cleanup', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const expiredDate = new Date(Date.now() - 60 * 60 * 1000);

      mockPrisma.addMockRefreshToken({
        id: 'expired1',
        token: 'expired_token',
        expiresAt: expiredDate,
      });

      // Act
      await cleanupService.cleanupExpiredRefreshTokens();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith('🧹 Cleanup: Removed 1 expired refresh tokens');

      consoleSpy.mockRestore();
    });

    it('should handle and rethrow database errors', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockError = new Error('Database connection failed');

      mockPrisma.refreshToken.deleteMany.mockRejectedValue(mockError);

      // Act & Assert
      await expect(cleanupService.cleanupExpiredRefreshTokens()).rejects.toThrow('Database connection failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error during refresh token cleanup:', mockError);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('cleanupExpiredChallenges', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(mockPrisma as any);
    });

    it('should clean up expired challenges', async () => {
      // Arrange: Add some expired and non-expired challenges
      const expiredDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Add expired challenges directly to the mock data
      const expiredChallenge1: MockChallenge = {
        id: 'expired1',
        challenge: 'expired_challenge_1',
        type: 'webauthn',
        expiresAt: expiredDate,
        createdAt: new Date(),
      };

      const expiredChallenge2: MockChallenge = {
        id: 'expired2',
        challenge: 'expired_challenge_2',
        type: 'webauthn',
        expiresAt: expiredDate,
        createdAt: new Date(),
      };

      const validChallenge: MockChallenge = {
        id: 'valid1',
        challenge: 'valid_challenge',
        type: 'webauthn',
        expiresAt: futureDate,
        createdAt: new Date(),
      };

      // Mock the deleteMany response for challenges
      mockPrisma.challenge.deleteMany = jest.fn().mockResolvedValue({ count: 2 });

      // Act
      const result = await cleanupService.cleanupExpiredChallenges();

      // Assert
      expect(result.deletedCount).toBe(2);
      expect(mockPrisma.challenge.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should return zero when no expired challenges exist', async () => {
      // Arrange
      mockPrisma.challenge.deleteMany = jest.fn().mockResolvedValue({ count: 0 });

      // Act
      const result = await cleanupService.cleanupExpiredChallenges();

      // Assert
      expect(result.deletedCount).toBe(0);
    });

    it('should log successful cleanup', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockPrisma.challenge.deleteMany = jest.fn().mockResolvedValue({ count: 1 });

      // Act
      await cleanupService.cleanupExpiredChallenges();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith('🧹 Cleanup: Removed 1 expired WebAuthn challenges');

      consoleSpy.mockRestore();
    });

    it('should handle and rethrow database errors', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockError = new Error('Database connection failed');

      mockPrisma.challenge.deleteMany = jest.fn().mockRejectedValue(mockError);

      // Act & Assert
      await expect(cleanupService.cleanupExpiredChallenges()).rejects.toThrow('Database connection failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error during challenge cleanup:', mockError);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('performAllCleanups', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(mockPrisma as any);
    });

    it('should perform both refresh token and challenge cleanups in standard mode', async () => {
      // Arrange
      const expiredDate = new Date(Date.now() - 60 * 60 * 1000);

      mockPrisma.addMockRefreshToken({
        id: 'expired1',
        token: 'expired_token',
        expiresAt: expiredDate,
      });

      mockPrisma.challenge.deleteMany = jest.fn().mockResolvedValue({ count: 3 });

      // Act
      const result = await cleanupService.performAllCleanups();

      // Assert
      expect(result.refreshTokensDeleted).toBe(1);
      expect(result.challengesDeleted).toBe(3);
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.challenge.deleteMany).toHaveBeenCalled();
    });

    it('should call lightweight cleanup in serverless mode', async () => {
      // Arrange
      cleanupService = new CleanupService(mockPrisma as any, true);

      const performLightweightCleanupSpy = jest.spyOn(
        cleanupService as any,
        'performLightweightCleanup'
      ).mockResolvedValue({
        refreshTokensDeleted: 2,
        challengesDeleted: 1,
      });

      // Act
      const result = await cleanupService.performAllCleanups();

      // Assert
      expect(result.refreshTokensDeleted).toBe(2);
      expect(result.challengesDeleted).toBe(1);
      expect(performLightweightCleanupSpy).toHaveBeenCalled();
    });

    it('should handle parallel execution of both cleanups', async () => {
      // Arrange
      let refreshTokenCleanupCalled = false;
      let challengeCleanupCalled = false;

      mockPrisma.refreshToken.deleteMany.mockImplementation(async () => {
        refreshTokenCleanupCalled = true;
        return { count: 2 };
      });

      mockPrisma.challenge.deleteMany = jest.fn().mockImplementation(async () => {
        challengeCleanupCalled = true;
        return { count: 1 };
      });

      // Act
      const result = await cleanupService.performAllCleanups();

      // Assert
      expect(refreshTokenCleanupCalled).toBe(true);
      expect(challengeCleanupCalled).toBe(true);
      expect(result.refreshTokensDeleted).toBe(2);
      expect(result.challengesDeleted).toBe(1);
    });
  });

  describe('performLightweightCleanup (serverless mode)', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(mockPrisma as any, true);
    });

    it('should perform lightweight cleanup with 24-hour cutoff', async () => {
      // Arrange
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - 24);

      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.challenge.deleteMany = jest.fn().mockResolvedValue({ count: 2 });

      // Act
      const result = await cleanupService.performAllCleanups();

      // Assert
      expect(result.refreshTokensDeleted).toBe(1);
      expect(result.challengesDeleted).toBe(2);

      // Verify the cutoff date is approximately 24 hours ago
      const refreshTokenCall = mockPrisma.refreshToken.deleteMany.mock.calls[0][0];
      const challengeCall = mockPrisma.challenge.deleteMany.mock.calls[0][0];

      expect(refreshTokenCall.where.expiresAt.lt).toBeInstanceOf(Date);
      expect(challengeCall.where.expiresAt.lt).toBeInstanceOf(Date);

      // Check that the cutoff date is approximately 24 hours ago (within 1 minute tolerance)
      const expectedCutoff = new Date();
      expectedCutoff.setHours(expectedCutoff.getHours() - 24);
      const actualCutoff = refreshTokenCall.where.expiresAt.lt;
      const timeDifference = Math.abs(expectedCutoff.getTime() - actualCutoff.getTime());
      expect(timeDifference).toBeLessThan(60 * 1000); // Less than 1 minute difference
    });

    it('should propagate database errors in serverless mode', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockError = new Error('Database timeout');

      mockPrisma.refreshToken.deleteMany.mockRejectedValue(mockError);
      mockPrisma.challenge.deleteMany = jest.fn().mockRejectedValue(mockError);

      // Act
      await expect(cleanupService.performAllCleanups()).rejects.toThrow('Database timeout');
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error during lightweight cleanup:', mockError);

      consoleErrorSpy.mockRestore();
    });

    it('should return zero counts when no expired items exist in serverless mode', async () => {
      // Arrange
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.challenge.deleteMany = jest.fn().mockResolvedValue({ count: 0 });

      // Act
      const result = await cleanupService.performAllCleanups();

      // Assert
      expect(result.refreshTokensDeleted).toBe(0);
      expect(result.challengesDeleted).toBe(0);
    });
  });

  describe('Error handling scenarios', () => {
    beforeEach(() => {
      cleanupService = new CleanupService(mockPrisma as any);
    });

    it('should handle concurrent access scenarios', async () => {
      // Arrange
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      mockPrisma.refreshToken.deleteMany.mockImplementation(async () => {
        await delay(50);
        return { count: 1 };
      });

      mockPrisma.challenge.deleteMany = jest.fn().mockImplementation(async () => {
        await delay(30);
        return { count: 2 };
      });

      // Act - Run multiple cleanups concurrently
      const promises = [
        cleanupService.performAllCleanups(),
        cleanupService.performAllCleanups(),
        cleanupService.performAllCleanups(),
      ];

      const results = await Promise.all(promises);

      // Assert - All should complete successfully
      results.forEach(result => {
        expect(result.refreshTokensDeleted).toBe(1);
        expect(result.challengesDeleted).toBe(2);
      });
    });

    it('should handle partial failures in cleanup operations', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Refresh token cleanup succeeds, challenge cleanup fails
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.challenge.deleteMany = jest.fn().mockRejectedValue(new Error('Challenge cleanup failed'));

      // Act & Assert
      await expect(cleanupService.performAllCleanups()).rejects.toThrow('Challenge cleanup failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error during challenge cleanup:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should handle extremely large cleanup operations', async () => {
      // Arrange
      const largeCount = 10000;
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: largeCount });
      mockPrisma.challenge.deleteMany = jest.fn().mockResolvedValue({ count: largeCount });

      // Act
      const result = await cleanupService.performAllCleanups();

      // Assert
      expect(result.refreshTokensDeleted).toBe(largeCount);
      expect(result.challengesDeleted).toBe(largeCount);
    });
  });

  describe('Integration scenarios', () => {
    it('should work correctly with real-world token expiration patterns', async () => {
      // Arrange
      cleanupService = new CleanupService(mockPrisma as any);
      const now = new Date();

      // Add tokens with various expiration patterns
      const tokens = [
        { id: 'expired_1_day', expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        { id: 'expired_1_hour', expiresAt: new Date(now.getTime() - 60 * 60 * 1000) },
        { id: 'expired_1_minute', expiresAt: new Date(now.getTime() - 60 * 1000) },
        { id: 'valid_future', expiresAt: new Date(now.getTime() + 60 * 60 * 1000) },
        { id: 'valid_far_future', expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      ];

      tokens.forEach(token => {
        mockPrisma.addMockRefreshToken({
          id: token.id,
          token: `token_${token.id}`,
          expiresAt: token.expiresAt,
        });
      });

      // Act
      const result = await cleanupService.cleanupExpiredRefreshTokens();

      // Assert - Should clean up the 3 expired tokens
      expect(result.deletedCount).toBe(3);
    });

    it('should handle timezone-related edge cases', async () => {
      // Arrange
      cleanupService = new CleanupService(mockPrisma as any);

      // Create a token that is clearly expired (1 hour ago in UTC)
      const utcNow = new Date();
      const expiredToken = new Date(utcNow.getTime() - 60 * 60 * 1000); // 1 hour ago

      mockPrisma.addMockRefreshToken({
        id: 'timezone_test',
        token: 'timezone_token',
        expiresAt: expiredToken,
      });

      // Act
      const result = await cleanupService.cleanupExpiredRefreshTokens();

      // Assert
      expect(result.deletedCount).toBe(1);
    });
  });
});