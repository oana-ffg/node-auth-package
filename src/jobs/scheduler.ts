import * as cron from 'node-cron';
import { CleanupService } from '../services/cleanupService';

export interface SchedulerConfig {
  schedule: string;
  timezone: string;
}

export class JobScheduler {
  private cleanupService: CleanupService;
  private config: SchedulerConfig;
  private cleanupTask?: cron.ScheduledTask;
  private isCleanupJobRunning = false;

  constructor(cleanupService: CleanupService, config: SchedulerConfig) {
    this.cleanupService = cleanupService;
    this.config = config;
  }

  public startScheduledJobs(): void {
    if (this.cleanupTask) {
      this.cleanupTask.start();
      return;
    }
    console.log('🕒 Starting scheduled jobs...');

    this.cleanupTask = cron.schedule(this.config.schedule, async () => {
      if (this.isCleanupJobRunning) {
        console.log('⏳ Cleanup job already running, skipping this execution');
        return;
      }

      this.isCleanupJobRunning = true;

      try {
        console.log('🧹 Starting cleanup of expired tokens and challenges...');
        const result = await this.cleanupService.performAllCleanups();

        const totalDeleted = result.refreshTokensDeleted + result.challengesDeleted;
        if (totalDeleted > 0) {
          console.log(`✅ Cleanup completed: ${result.refreshTokensDeleted} expired tokens and ${result.challengesDeleted} expired challenges removed`);
        } else {
          console.log('✅ Cleanup completed: No expired items found');
        }
      } catch (error) {
        console.error('❌ Cleanup job failed:', error);
      } finally {
        this.isCleanupJobRunning = false;
      }
    }, {
      timezone: this.config.timezone,
    });

    console.log(`✅ Cleanup job scheduled: ${this.config.schedule} (${this.config.timezone}) - Cleaning tokens and challenges`);
  }

  public stopScheduledJobs(): void {
    this.cleanupTask?.stop();
    console.log('🛑 Cleanup job stopped');
  }
}