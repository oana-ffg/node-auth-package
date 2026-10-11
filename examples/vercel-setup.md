# Vercel Serverless Setup Guide

## Quick Setup

### 1. Install the package
```bash
npm install firefun-node-auth@alpha @prisma/client express
```

### 2. Database Setup
Since Vercel functions are stateless, you'll need a managed PostgreSQL database:

**Recommended providers:**
- Vercel Postgres (integrated)
- Supabase
- PlanetScale
- Railway

### 3. Environment Variables
Add to your Vercel project settings:

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# JWT (min 32 chars)
JWT_SECRET="your-super-secret-jwt-key-at-least-32-characters-long"

# Encryption (min 32 chars)
ENCRYPTION_KEY_V1="your-encryption-key-v1-at-least-32-characters-long"
```

Set `WEBAUTHN_RP_ID` to the stable hostname users sign in through and `WEBAUTHN_ORIGIN` to its HTTPS origin. Keep both constant across deployments so existing passkeys remain usable.

### 4. API Route Examples

**api/auth/register.ts:**
```typescript
import { registerUserWithRateLimit } from 'firefun-node-auth/serverless';
import { authConfig } from '../../lib/auth-config';

export default async function handler(req: any, res: any) {
  return registerUserWithRateLimit(req, res, authConfig);
}
```

**api/auth/login.ts:**
```typescript
import { loginUserWithRateLimit } from 'firefun-node-auth/serverless';
import { authConfig } from '../../lib/auth-config';

export default async function handler(req: any, res: any) {
  return loginUserWithRateLimit(req, res, authConfig);
}
```

### 5. Prisma Setup for Vercel

**prisma/schema.prisma** (already included in package):
```prisma
// The schema is automatically copied during setup
// Just run: npx firefun-auth-setup
```

**Deploy migrations:**
```bash
npx prisma migrate deploy
npx prisma generate
```

### 6. Configuration Helper (Recommended)

**lib/auth-config.ts:**
```typescript
import { PrismaClient } from '@prisma/client';
import { FirefunAuthConfig } from 'firefun-node-auth';

const prisma = new PrismaClient();
const rpId = process.env.WEBAUTHN_RP_ID;
const origin = process.env.WEBAUTHN_ORIGIN;
if (!rpId || !origin) {
  throw new Error('Configure WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN for the stable login domain');
}

export const authConfig: FirefunAuthConfig = {
  appName: 'My App',
  prisma,
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '15m',
    refreshExpiresIn: '7d',
  },
  security: { bcryptRounds: 12 },
  encryption: {
    keys: { v1: process.env.ENCRYPTION_KEY_V1! },
    currentVersion: 'v1',
  },
  webauthn: {
    rpName: 'My App',
    rpId,
    origin,
  },
  rateLimiting: {
    general: { windowMs: 900000, maxRequests: 100, message: 'Too many requests' },
    auth: { windowMs: 900000, maxRequests: 5, message: 'Too many auth attempts' },
    twoFA: { windowMs: 900000, maxRequests: 3, message: 'Too many 2FA attempts' },
  },
  serverless: true,
};
```

Reuse the exported configuration object across requests; creating a new object on every invocation resets the in-memory limiter. Treat configuration as immutable and replace the object when settings change. Counters persist only within a warm process and are not shared across serverless instances.

## Performance Benefits

With `serverless: true`:
- 🚫 **No background jobs**: Scheduler disabled
- 📦 **Lazy loading**: Components load on-demand

## Available Serverless Functions

```typescript
import {
  // Auth functions
  registerUser,
  loginUser,
  loginWith2FA,
  refreshTokenHandler,

  // 2FA functions
  generate2FASecret,
  confirm2FA,
  reset2FA,
  disable2FA,

  // Passkey functions
  startPasskeyAuthentication,
  completePasskeyAuthentication,
  startPasskeyRegistration,
  completePasskeyRegistration,
  listPasskeys,
  deletePasskey,
  renamePasskey,

  // Account management
  deleteAccount,

  // With middleware pre-applied
  registerUserWithRateLimit,
  loginUserWithRateLimit,
  generate2FASecretWithAuth,
  // ... etc
} from 'firefun-node-auth/serverless';
```

## Cleanup in Serverless

Since cron jobs don't work in serverless:

**api/cleanup.ts** (optional):
```typescript
import { performServerlessCleanup } from 'firefun-node-auth/serverless';
import { authConfig } from '../lib/auth-config';

export default async function handler(req: any, res: any) {
  const result = await performServerlessCleanup(authConfig);
  return res.json(result);
}
```

Call this endpoint periodically or trigger via Vercel Cron Jobs.