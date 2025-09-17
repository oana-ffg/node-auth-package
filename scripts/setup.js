#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

class FirefunAuthSetup {
  constructor() {
    this.packageRoot = path.resolve(__dirname, '..');
    this.userRoot = process.cwd();
    this.userPrismaDir = path.join(this.userRoot, 'prisma');
    this.packagePrismaDir = path.join(this.packageRoot, 'prisma');
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[type]}${message}${colors.reset}`);
  }

  async setup() {
    try {
      this.log('🚀 Setting up firefun-node-auth database...\n');

      // Check if we're in a Node.js project
      await this.checkNodeProject();

      // Create prisma directory if it doesn't exist
      await this.createPrismaDirectory();

      // Handle existing schema
      await this.handleExistingSchema();

      // Copy schema and migrations
      await this.copyPrismaFiles();

      // Generate or update .env file
      await this.setupEnvironmentFile();

      // Generate Prisma client
      await this.generatePrismaClient();

      // Run migrations
      await this.runMigrations();

      this.log('✅ Setup completed successfully!\n', 'success');
      this.log('Next steps:', 'info');
      this.log('1. Make sure your DATABASE_URL is set in .env');
      this.log('2. Import FirefunAuth in your application:');
      this.log('   import { FirefunAuth } from "firefun-node-auth"');
      this.log('\nFor full documentation, visit: https://www.npmjs.com/package/firefun-node-auth');

    } catch (error) {
      this.log(`❌ Setup failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }

  async checkNodeProject() {
    const packageJsonPath = path.join(this.userRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('No package.json found. Please run this command in the root of your Node.js project.');
    }
    this.log('✓ Found package.json', 'success');
  }

  async createPrismaDirectory() {
    if (!fs.existsSync(this.userPrismaDir)) {
      fs.mkdirSync(this.userPrismaDir, { recursive: true });
      this.log('✓ Created prisma/ directory', 'success');
    } else {
      this.log('✓ Prisma directory already exists', 'success');
    }
  }

  async handleExistingSchema() {
    const userSchemaPath = path.join(this.userPrismaDir, 'schema.prisma');
    if (fs.existsSync(userSchemaPath)) {
      // Create backup
      const backupPath = path.join(this.userPrismaDir, 'schema.prisma.backup');
      fs.copyFileSync(userSchemaPath, backupPath);
      this.log('⚠️  Existing schema.prisma backed up to schema.prisma.backup', 'warning');
    }
  }

  async copyPrismaFiles() {
    // Copy schema
    const sourceSchemePath = path.join(this.packagePrismaDir, 'schema.prisma');
    const targetSchemePath = path.join(this.userPrismaDir, 'schema.prisma');

    if (fs.existsSync(sourceSchemePath)) {
      fs.copyFileSync(sourceSchemePath, targetSchemePath);
      this.log('✓ Copied schema.prisma', 'success');
    }

    // Copy migrations
    const sourceMigrationsDir = path.join(this.packagePrismaDir, 'migrations');
    const targetMigrationsDir = path.join(this.userPrismaDir, 'migrations');

    if (fs.existsSync(sourceMigrationsDir)) {
      if (fs.existsSync(targetMigrationsDir)) {
        // Backup existing migrations
        const backupMigrationsDir = path.join(this.userPrismaDir, 'migrations.backup');
        if (fs.existsSync(backupMigrationsDir)) {
          fs.rmSync(backupMigrationsDir, { recursive: true, force: true });
        }
        fs.renameSync(targetMigrationsDir, backupMigrationsDir);
        this.log('⚠️  Existing migrations backed up to migrations.backup/', 'warning');
      }

      this.copyDirectorySync(sourceMigrationsDir, targetMigrationsDir);
      this.log('✓ Copied migration files', 'success');
    }
  }

  copyDirectorySync(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const files = fs.readdirSync(src);
    files.forEach(file => {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);

      if (fs.statSync(srcPath).isDirectory()) {
        this.copyDirectorySync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }

  generateSecureKey(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  async setupEnvironmentFile() {
    const envPath = path.join(this.userRoot, '.env');
    let envContent = '';
    let envExists = fs.existsSync(envPath);

    if (envExists) {
      envContent = fs.readFileSync(envPath, 'utf8');
      this.log('✓ Found existing .env file', 'success');
    } else {
      this.log('Creating .env file...', 'info');
    }

    const requiredKeys = {
      'DATABASE_URL': 'postgresql://user:password@localhost:5432/myapp',
      'JWT_SECRET': this.generateSecureKey(32),
      'ENCRYPTION_KEY_V1': this.generateSecureKey(32)
    };

    let updated = false;
    let newKeys = [];

    for (const [key, defaultValue] of Object.entries(requiredKeys)) {
      const keyPattern = new RegExp(`^${key}=`, 'm');

      if (!keyPattern.test(envContent)) {
        // Key doesn't exist, add it
        const value = key === 'DATABASE_URL' ? defaultValue : defaultValue;
        const comment = key === 'DATABASE_URL'
          ? '# Update this with your actual database connection string'
          : `# Auto-generated secure key for ${key}`;

        envContent += `\n${comment}\n${key}="${value}"\n`;
        updated = true;
        newKeys.push(key);
      }
    }

    if (updated) {
      fs.writeFileSync(envPath, envContent);
      this.log(`✓ Updated .env with required keys: ${newKeys.join(', ')}`, 'success');

      if (newKeys.includes('DATABASE_URL')) {
        this.log('⚠️  Please update DATABASE_URL in .env with your actual database connection', 'warning');
      }

      if (newKeys.includes('JWT_SECRET') || newKeys.includes('ENCRYPTION_KEY_V1')) {
        this.log('✓ Generated secure keys automatically', 'success');
      }
    } else {
      this.log('✓ All required environment variables already exist', 'success');
    }

    // Validate DATABASE_URL exists and is not default
    const hasDbUrl = /^DATABASE_URL=.+$/m.test(envContent);
    const isDefaultDbUrl = envContent.includes('DATABASE_URL="postgresql://user:password@localhost:5432/myapp"');

    if (!hasDbUrl) {
      this.log('⚠️  DATABASE_URL not found in .env file', 'warning');
    } else if (isDefaultDbUrl) {
      this.log('⚠️  Please update DATABASE_URL with your actual database connection', 'warning');
    } else {
      this.log('✓ DATABASE_URL configured', 'success');
    }
  }

  async generatePrismaClient() {
    try {
      this.log('Generating Prisma client...');
      execSync('npx prisma generate', {
        cwd: this.userRoot,
        stdio: 'pipe'
      });
      this.log('✓ Prisma client generated', 'success');
    } catch (error) {
      this.log('⚠️  Failed to generate Prisma client. Run "npx prisma generate" manually.', 'warning');
    }
  }

  async runMigrations() {
    try {
      this.log('Running database migrations...');
      execSync('npx prisma migrate deploy', {
        cwd: this.userRoot,
        stdio: 'pipe'
      });
      this.log('✓ Database migrations completed', 'success');
    } catch (error) {
      this.log('⚠️  Failed to run migrations. Make sure your DATABASE_URL is correct and run "npx prisma migrate deploy" manually.', 'warning');
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new FirefunAuthSetup();
  setup.setup();
}

module.exports = FirefunAuthSetup;