# 🔐 @firefun-games/node-auth

> **Alpha Release** - A secure, production-ready Node.js authentication package built by FireFun Games.

A comprehensive authentication solution featuring JWT tokens, 2FA, passkeys (WebAuthn), rate limiting, and automated cleanup. Extracted from our production auth system and packaged for reuse across Node.js projects.

## ✨ Features

### Core Authentication
- ✅ **User Registration & Login** - Secure user account creation and authentication
- ✅ **JWT Token Management** - Access tokens with refresh token rotation
- ✅ **Password Security** - Bcrypt hashing with configurable rounds
- ✅ **Input Validation** - Zod schemas for comprehensive request validation

### Advanced Security
- ✅ **Two-Factor Authentication (2FA)** - TOTP-based 2FA with QR codes
- ✅ **Passkeys (WebAuthn)** - Modern passwordless authentication
- ✅ **Rate Limiting** - Configurable protection against brute force attacks
- ✅ **Encrypted Secrets** - AES-256-GCM encryption for sensitive 2FA data
- ✅ **Token Cleanup** - Automated cleanup of expired tokens and challenges
- ✅ **Account Management** - Secure account deletion with cascade cleanup

### Infrastructure Features
- ✅ **Database Management** - PostgreSQL with Prisma ORM
- ✅ **TypeScript** - Full type safety across the package
- ✅ **Modular Design** - Use individual components or the complete solution
- ✅ **Scheduled Jobs** - Background cleanup tasks with node-cron
- ✅ **Express Integration** - Ready-to-use middleware and routes

## 🛠️ Tech Stack

- **Runtime**: Node.js (>=16)
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma
- **Authentication**: JWT, TOTP, WebAuthn
- **Security**: bcrypt, AES-256-GCM encryption, rate limiting

## 🚀 Installation

```bash
npm install @firefun-games/node-auth @prisma/client express
```

## 📖 Quick Start

### 1. Basic Setup

```typescript
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { FirefunAuth } from '@firefun-games/node-auth';

const app = express();
const prisma = new PrismaClient();

// Initialize FirefunAuth
const auth = new FirefunAuth({
  appName: 'My App',
  prisma,
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '15m',
    refreshExpiresIn: '7d',
  },
  security: {
    bcryptRounds: 12,
  },
  encryption: {
    keys: {
      v1: process.env.ENCRYPTION_KEY_V1!,
    },
    currentVersion: 'v1',
  },
  webauthn: {
    rpName: 'My App',
    rpId: 'localhost',
    origin: 'http://localhost:3000',
  },
  rateLimiting: {
    general: { windowMs: 900000, maxRequests: 100, message: 'Too many requests' },
    auth: { windowMs: 900000, maxRequests: 5, message: 'Too many auth attempts' },
    twoFA: { windowMs: 900000, maxRequests: 3, message: 'Too many 2FA attempts' },
  },
  scheduler: {
    schedule: '0 2 * * *', // Daily at 2 AM
    timezone: 'America/New_York',
  },
});

// Apply general rate limiting
app.use(auth.getRateLimitMiddleware().general);

// Setup routes
app.use('/api/auth', auth.createAuthRoutes());
app.use('/api/passkey', auth.createPasskeyRoutes());

// Start cleanup scheduler
auth.startScheduler();

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### 2. Database Setup

First, copy the Prisma schema from the package to your project:

```bash
cp node_modules/@firefun-games/node-auth/prisma/schema.prisma ./prisma/
```

Then run migrations:

```bash
npx prisma migrate dev
npx prisma generate
```

### 3. Environment Configuration

Create your `.env` file:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/myapp"

# JWT (required - min 32 chars)
JWT_SECRET="your-super-secret-jwt-key-at-least-32-characters-long"

# Encryption (required - min 32 chars)
ENCRYPTION_KEY_V1="your-encryption-key-v1-at-least-32-characters-long"

# Optional configurations
PORT=3000
NODE_ENV=development
```

## 📚 API Endpoints

### Authentication Routes (`/api/auth`)

- `POST /register` - User registration
- `POST /login` - User login (with 2FA support)
- `POST /login/2fa` - Complete 2FA login
- `POST /refresh` - Refresh access token
- `POST /2fa/generate` - Generate 2FA secret (protected)
- `POST /2fa/confirm` - Enable 2FA (protected)
- `POST /2fa/reset` - Reset 2FA (protected)
- `POST /2fa/disable` - Disable 2FA (protected)
- `DELETE /account` - Delete account (protected)

### Passkey Routes (`/api/passkey`)

- `POST /authenticate/start` - Start passkey authentication
- `POST /authenticate/complete` - Complete passkey authentication
- `POST /register/start` - Start passkey registration (protected)
- `POST /register/complete` - Complete passkey registration (protected)
- `GET /list` - List user's passkeys (protected)
- `DELETE /:id` - Delete passkey (protected)
- `PATCH /:id/rename` - Rename passkey (protected)

### Protected Route Example

```typescript
import { AuthenticatedRequest } from '@firefun-games/node-auth';

// Protect routes with the auth middleware
app.get('/api/profile', auth.getAuthMiddleware(), (req: AuthenticatedRequest, res) => {
  const userId = req.userId; // Available after auth middleware
  res.json({ message: `Hello user ${userId}` });
});
```

## 🔧 Advanced Usage

### Custom Rate Limiting

```typescript
const rateLimits = auth.getRateLimitMiddleware();

// Apply specific rate limits to custom routes
app.use('/api/sensitive', rateLimits.twoFA);
```

### Manual Cleanup

```typescript
// Trigger cleanup manually
const result = await auth.performCleanup();
console.log(`Cleaned up ${result.refreshTokensDeleted} tokens and ${result.challengesDeleted} challenges`);
```

### Using Individual Components

```typescript
import { AuthController, AuthMiddleware, CleanupService } from '@firefun-games/node-auth';

// Use components individually for custom implementations
const authMiddleware = new AuthMiddleware({ jwtSecret: 'your-secret' });
const cleanupService = new CleanupService(prisma);
```

## 🔒 Security Features

### Password Requirements
- Minimum 8 characters (configurable)
- At least one uppercase letter
- At least one number
- At least one special character

### 2FA Implementation
- TOTP-based (compatible with Google Authenticator, Authy, etc.)
- QR code generation for easy setup
- Encrypted storage of secrets using AES-256-GCM
- Password verification required for all 2FA operations

### Rate Limiting
- **General**: 100 requests per 15 minutes
- **Authentication**: 5 attempts per 15 minutes
- **2FA Operations**: 3 attempts per 15 minutes

### Token Security
- Short-lived access tokens (15 minutes default)
- Refresh token rotation
- Automatic cleanup of expired tokens

## 🏗️ Architecture

The package follows a modular architecture:

```
@firefun-games/node-auth/
├── controllers/     # Business logic (Auth, Passkey)
├── middleware/      # Express middleware (Auth, Rate Limiting)
├── services/        # Background services (Cleanup)
├── utils/           # Utilities (Encryption)
├── schemas/         # Validation schemas
├── jobs/            # Scheduled job management
└── types/           # TypeScript type definitions
```

## 📋 Requirements

- **Node.js**: >= 16.0.0
- **Database**: PostgreSQL (via Prisma)
- **Express**: >= 5.0.0

## 🧪 Development

For package development:

```bash
git clone https://github.com/firefun-games/node-auth-package.git
cd node-auth-package
npm install
npm run build
```

## 📄 License

ISC License. See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

This package is currently in alpha. Issues and suggestions welcome!

- **Issues**: [GitHub Issues](https://github.com/firefun-games/node-auth-package/issues)
- **Discussions**: [GitHub Discussions](https://github.com/firefun-games/node-auth-package/discussions)

## 🚀 About FireFun Games

Built with ❤️ by [FireFun Games](https://firefungames.com) for our Node.js projects and shared with the community.

---

**⭐ If this package helps secure your Node.js applications, please consider giving it a star!**