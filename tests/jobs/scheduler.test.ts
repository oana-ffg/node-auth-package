/**
 * JobScheduler Test Suite
 *
 * Tests for the JobScheduler class that handles scheduling of cleanup jobs
 * using node-cron for automated maintenance tasks.
 */

import { JobScheduler, SchedulerConfig } from '../../src/jobs/scheduler';
import { CleanupService } from '../../src/services/cleanupService';
import * as cron from 'node-cron';

// Mock node-cron
jest.mock('node-cron');
const mockCron = cron as jest.Mocked<typeof cron>;

describe('JobScheduler', () => {
  let jobScheduler: JobScheduler;
  let mockCleanupService: jest.Mocked<CleanupService>;
  let mockConfig: SchedulerConfig;
  let mockTask: any;

  beforeEach(() => {
    // Create mock cleanup service with default return values
    mockCleanupService = {
      performAllCleanups: jest.fn().mockResolvedValue({
        refreshTokensDeleted: 0,
        challengesDeleted: 0,
      }),
      cleanupExpiredRefreshTokens: jest.fn(),
      cleanupExpiredChallenges: jest.fn(),
    } as any;

    // Default scheduler config
    mockConfig = {
      schedule: '0 2 * * *', // Daily at 2 AM
      timezone: 'UTC',
    };

    // Create mock task
    mockTask = {
      stop: jest.fn(),
      start: jest.fn(),
      destroy: jest.fn(),
    };

    // Reset all mocks
    jest.clearAllMocks();
    mockCron.schedule.mockReturnValue(mockTask);
    mockCron.getTasks.mockReturnValue(new Map([['task1', mockTask]]));
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset the mock to default behavior
    mockCleanupService.performAllCleanups.mockResolvedValue({
      refreshTokensDeleted: 0,
      challengesDeleted: 0,
    });
  });

  describe('Constructor', () => {
    it('should create scheduler with cleanup service and config', () => {
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);
      expect(jobScheduler).toBeDefined();
    });

    it('should store cleanup service and config correctly', () => {
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);

      // Access private properties for testing (using any type)
      const scheduler = jobScheduler as any;
      expect(scheduler.cleanupService).toBe(mockCleanupService);
      expect(scheduler.config).toBe(mockConfig);
      expect(scheduler.isCleanupJobRunning).toBe(false);
    });
  });

  describe('startScheduledJobs', () => {
    beforeEach(() => {
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);
    });

    it('should start scheduled cleanup jobs with correct configuration', () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // Act
      jobScheduler.startScheduledJobs();

      // Assert
      expect(mockCron.schedule).toHaveBeenCalledWith(
        mockConfig.schedule,
        expect.any(Function),
        {
          timezone: mockConfig.timezone,
        }
      );

      expect(consoleSpy).toHaveBeenCalledWith('🕒 Starting scheduled jobs...');
      expect(consoleSpy).toHaveBeenCalledWith(
        `✅ Cleanup job scheduled: ${mockConfig.schedule} (${mockConfig.timezone}) - Cleaning tokens and challenges`
      );

      consoleSpy.mockRestore();
    });

    it('should use custom schedule and timezone when provided', () => {
      // Arrange
      const customConfig: SchedulerConfig = {
        schedule: '0 */6 * * *', // Every 6 hours
        timezone: 'America/New_York',
      };

      jobScheduler = new JobScheduler(mockCleanupService, customConfig);

      // Act
      jobScheduler.startScheduledJobs();

      // Assert
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '0 */6 * * *',
        expect.any(Function),
        {
          timezone: 'America/New_York',
        }
      );
    });

    it('should execute cleanup when cron job runs', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockCleanupService.performAllCleanups.mockResolvedValue({
        refreshTokensDeleted: 5,
        challengesDeleted: 3,
      });

      // Capture the cron callback function
      let cronCallback: Function = () => {};
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        cronCallback = callback;
        return mockTask;
      });

      // Act
      jobScheduler.startScheduledJobs();
      await cronCallback(); // Execute the scheduled job

      // Assert
      expect(mockCleanupService.performAllCleanups).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('🧹 Starting cleanup of expired tokens and challenges...');
      expect(consoleSpy).toHaveBeenCalledWith(
        '✅ Cleanup completed: 5 expired tokens and 3 expired challenges removed'
      );

      consoleSpy.mockRestore();
    });

    it('should log when no expired items are found', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockCleanupService.performAllCleanups.mockResolvedValue({
        refreshTokensDeleted: 0,
        challengesDeleted: 0,
      });

      let cronCallback: Function = () => {};
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        cronCallback = callback;
        return mockTask;
      });

      // Act
      jobScheduler.startScheduledJobs();
      await cronCallback();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith('✅ Cleanup completed: No expired items found');

      consoleSpy.mockRestore();
    });

    it('should prevent concurrent cleanup jobs from running', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      let resolveCleanup: Function = () => {};

      // Make cleanup service hang
      mockCleanupService.performAllCleanups.mockImplementation(() => {
        return new Promise(resolve => {
          resolveCleanup = resolve;
        });
      });

      let cronCallback: Function = () => {};
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        cronCallback = callback;
        return mockTask;
      });

      jobScheduler.startScheduledJobs();

      // Act - Start first cleanup (will hang)
      const firstCleanup = cronCallback();

      // Try to start second cleanup while first is running
      await cronCallback();

      // Assert - Second cleanup should be skipped
      expect(consoleSpy).toHaveBeenCalledWith('⏳ Cleanup job already running, skipping this execution');
      expect(mockCleanupService.performAllCleanups).toHaveBeenCalledTimes(1);

      // Clean up - resolve the hanging cleanup
      resolveCleanup({ refreshTokensDeleted: 1, challengesDeleted: 1 });
      await firstCleanup;

      consoleSpy.mockRestore();
    });

    it('should handle cleanup errors gracefully', async () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockError = new Error('Cleanup failed');
      mockCleanupService.performAllCleanups.mockRejectedValue(mockError);

      let cronCallback: Function = () => {};
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        cronCallback = callback;
        return mockTask;
      });

      // Act
      jobScheduler.startScheduledJobs();
      await cronCallback();

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Cleanup job failed:', mockError);

      // Verify that the running flag is reset after error
      const scheduler = jobScheduler as any;
      expect(scheduler.isCleanupJobRunning).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should reset running flag after successful cleanup', async () => {
      // Arrange
      mockCleanupService.performAllCleanups.mockResolvedValue({
        refreshTokensDeleted: 1,
        challengesDeleted: 1,
      });

      let cronCallback: Function = () => {};
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        cronCallback = callback;
        return mockTask;
      });

      // Act
      jobScheduler.startScheduledJobs();
      await cronCallback();

      // Assert
      const scheduler = jobScheduler as any;
      expect(scheduler.isCleanupJobRunning).toBe(false);
    });
  });

  describe('stopScheduledJobs', () => {
    beforeEach(() => {
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);
    });

    it('stops only its own cleanup task', () => {
      const unrelated = { stop: jest.fn() };
      mockCron.getTasks.mockReturnValue(new Map([['other', unrelated]]) as any);
      jobScheduler.startScheduledJobs();
      jobScheduler.stopScheduledJobs();
      expect(mockTask.stop).toHaveBeenCalledTimes(1);
      expect(unrelated.stop).not.toHaveBeenCalled();
      expect(mockCron.getTasks).not.toHaveBeenCalled();
    });

    it('reuses its task when restarted', () => {
      jobScheduler.startScheduledJobs();
      jobScheduler.startScheduledJobs();
      jobScheduler.stopScheduledJobs();
      jobScheduler.startScheduledJobs();
      expect(mockCron.schedule).toHaveBeenCalledTimes(1);
      expect(mockTask.start).toHaveBeenCalledTimes(2);
    });

    it('can stop before being started', () => {
      expect(() => jobScheduler.stopScheduledJobs()).not.toThrow();
      expect(mockTask.stop).not.toHaveBeenCalled();
    });
  });

  describe('Complex scheduling scenarios', () => {
    it('should handle different cron schedule formats', () => {
      const scheduleConfigs = [
        { schedule: '* * * * *', timezone: 'UTC' }, // Every minute
        { schedule: '0 */2 * * *', timezone: 'UTC' }, // Every 2 hours
        { schedule: '0 0 * * 0', timezone: 'UTC' }, // Every Sunday at midnight
        { schedule: '0 0 1 * *', timezone: 'UTC' }, // First day of every month
      ];

      scheduleConfigs.forEach(config => {
        jobScheduler = new JobScheduler(mockCleanupService, config);
        jobScheduler.startScheduledJobs();

        expect(mockCron.schedule).toHaveBeenCalledWith(
          config.schedule,
          expect.any(Function),
          { timezone: config.timezone }
        );
      });
    });

    it('should handle different timezone configurations', () => {
      const timezones = [
        'UTC',
        'America/New_York',
        'Europe/London',
        'Asia/Tokyo',
        'Australia/Sydney',
      ];

      timezones.forEach(timezone => {
        const config = { schedule: '0 2 * * *', timezone };
        jobScheduler = new JobScheduler(mockCleanupService, config);
        jobScheduler.startScheduledJobs();

        expect(mockCron.schedule).toHaveBeenCalledWith(
          config.schedule,
          expect.any(Function),
          { timezone }
        );
      });
    });
  });

  describe('Performance and reliability', () => {
    it('should handle long-running cleanup operations', async () => {
      // Arrange
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);

      mockCleanupService.performAllCleanups.mockResolvedValue({
        refreshTokensDeleted: 100,
        challengesDeleted: 50,
      });

      let capturedCallback: Function = () => Promise.resolve();
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        capturedCallback = callback;
        return mockTask;
      });

      // Act
      jobScheduler.startScheduledJobs();
      await capturedCallback();

      // Assert
      expect(mockCleanupService.performAllCleanups).toHaveBeenCalled();
    });

    it('should maintain state consistency across multiple job executions', async () => {
      // Arrange
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);

      mockCleanupService.performAllCleanups
        .mockResolvedValueOnce({ refreshTokensDeleted: 1, challengesDeleted: 1 })
        .mockResolvedValueOnce({ refreshTokensDeleted: 2, challengesDeleted: 0 })
        .mockResolvedValueOnce({ refreshTokensDeleted: 0, challengesDeleted: 3 });

      let capturedCallback: Function = () => Promise.resolve();
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        capturedCallback = callback;
        return mockTask;
      });

      jobScheduler.startScheduledJobs();

      // Act - Execute multiple times
      await capturedCallback();
      await capturedCallback();
      await capturedCallback();

      // Assert
      expect(mockCleanupService.performAllCleanups).toHaveBeenCalledTimes(3);

      // Verify final state
      const scheduler = jobScheduler as any;
      expect(scheduler.isCleanupJobRunning).toBe(false);
    });
  });

  describe('Error recovery scenarios', () => {
    it('should recover from cleanup service errors and continue scheduling', async () => {
      // Arrange
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockCleanupService.performAllCleanups
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce({ refreshTokensDeleted: 1, challengesDeleted: 1 });

      let capturedCallback: Function = () => Promise.resolve();
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        capturedCallback = callback;
        return mockTask;
      });

      jobScheduler.startScheduledJobs();

      // Act - First call fails, second succeeds
      await capturedCallback(); // Should fail but not crash
      await capturedCallback(); // Should succeed

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Cleanup job failed:', expect.any(Error));
      expect(mockCleanupService.performAllCleanups).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });

    it('should handle cron library errors gracefully', () => {
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);
      // Arrange
      const mockError = new Error('Cron scheduling failed');
      mockCron.schedule.mockImplementation(() => {
        throw mockError;
      });

      // Act & Assert
      expect(() => jobScheduler.startScheduledJobs()).toThrow('Cron scheduling failed');
    });
  });

  describe('Integration with CleanupService', () => {
    it('should correctly integrate with CleanupService methods', async () => {
      // Arrange
      jobScheduler = new JobScheduler(mockCleanupService, mockConfig);

      mockCleanupService.performAllCleanups.mockResolvedValue({
        refreshTokensDeleted: 10,
        challengesDeleted: 5,
      });

      let capturedCallback: Function = () => Promise.resolve();
      mockCron.schedule.mockImplementation((schedule, callback, options) => {
        capturedCallback = callback;
        return mockTask;
      });

      jobScheduler.startScheduledJobs();

      // Act
      await capturedCallback();

      // Assert
      expect(mockCleanupService.performAllCleanups).toHaveBeenCalledWith();
    });
  });
});