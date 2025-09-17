import { PrismaClient } from '@prisma/client';

export class CleanupService {
  private prisma: PrismaClient;
  private serverless: boolean;

  constructor(prisma: PrismaClient, serverless: boolean = false) {
    this.prisma = prisma;
    this.serverless = serverless;
  }

  public cleanupExpiredRefreshTokens = async (): Promise<{ deletedCount: number }> => {
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(), // Delete tokens that expired before now
          },
        },
      });

      console.log(`🧹 Cleanup: Removed ${result.count} expired refresh tokens`);

      return { deletedCount: result.count };
    } catch (error) {
      console.error('❌ Error during refresh token cleanup:', error);
      throw error;
    }
  };

  public cleanupExpiredChallenges = async (): Promise<{ deletedCount: number }> => {
    try {
      const result = await this.prisma.challenge.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(), // Delete challenges that expired before now
          },
        },
      });

      console.log(`🧹 Cleanup: Removed ${result.count} expired WebAuthn challenges`);

      return { deletedCount: result.count };
    } catch (error) {
      console.error('❌ Error during challenge cleanup:', error);
      throw error;
    }
  };

  // Combined cleanup function that runs both cleanups
  public performAllCleanups = async (): Promise<{ refreshTokensDeleted: number; challengesDeleted: number }> => {
    // In serverless mode, limit cleanup scope for performance
    if (this.serverless) {
      return this.performLightweightCleanup();
    }

    const [refreshTokenResult, challengeResult] = await Promise.all([
      this.cleanupExpiredRefreshTokens(),
      this.cleanupExpiredChallenges(),
    ]);

    return {
      refreshTokensDeleted: refreshTokenResult.deletedCount,
      challengesDeleted: challengeResult.deletedCount,
    };
  };

  // Lightweight cleanup for serverless environments
  private performLightweightCleanup = async (): Promise<{ refreshTokensDeleted: number; challengesDeleted: number }> => {
    try {
      // Only cleanup very old items to avoid long-running operations
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24); // Only cleanup items older than 24 hours

      const [refreshTokenResult, challengeResult] = await Promise.all([
        this.prisma.refreshToken.deleteMany({
          where: {
            expiresAt: {
              lt: cutoffDate,
            },
          },
        }),
        this.prisma.challenge.deleteMany({
          where: {
            expiresAt: {
              lt: cutoffDate,
            },
          },
        }),
      ]);

      return {
        refreshTokensDeleted: refreshTokenResult.count,
        challengesDeleted: challengeResult.count,
      };
    } catch (error) {
      console.error('❌ Error during lightweight cleanup:', error);
      return { refreshTokensDeleted: 0, challengesDeleted: 0 };
    }
  };
}