# AWS Lambda Serverless Setup Guide

## Setup for AWS Lambda + API Gateway

### 1. Install Dependencies
```bash
npm install firefun-node-auth@alpha @prisma/client
npm install -D @types/aws-lambda
```

### 2. Lambda Handler Example

**src/auth-handler.ts:**
```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { registerUserWithRateLimit, loginUserWithRateLimit } from 'firefun-node-auth/serverless';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const config = {
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
    rpId: process.env.DOMAIN!,
    origin: `https://${process.env.DOMAIN}`,
  },
  rateLimiting: {
    general: { windowMs: 900000, maxRequests: 100, message: 'Too many requests' },
    auth: { windowMs: 900000, maxRequests: 5, message: 'Too many auth attempts' },
    twoFA: { windowMs: 900000, maxRequests: 3, message: 'Too many 2FA attempts' },
  },
  serverless: true,
};

export const register = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const req = {
    body: JSON.parse(event.body || '{}'),
    headers: event.headers,
  };

  const res = {
    status: (code: number) => ({ json: (data: any) => ({ statusCode: code, body: JSON.stringify(data) }) }),
    json: (data: any) => ({ statusCode: 200, body: JSON.stringify(data) }),
  };

  return await registerUserWithRateLimit(req as any, res as any, config);
};

export const login = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const req = {
    body: JSON.parse(event.body || '{}'),
    headers: event.headers,
  };

  const res = {
    status: (code: number) => ({ json: (data: any) => ({ statusCode: code, body: JSON.stringify(data) }) }),
    json: (data: any) => ({ statusCode: 200, body: JSON.stringify(data) }),
  };

  return await loginUserWithRateLimit(req as any, res as any, config);
};
```

### 3. Serverless Framework (serverless.yml)

```yaml
service: my-auth-service

provider:
  name: aws
  runtime: nodejs18.x
  environment:
    DATABASE_URL: ${env:DATABASE_URL}
    JWT_SECRET: ${env:JWT_SECRET}
    ENCRYPTION_KEY_V1: ${env:ENCRYPTION_KEY_V1}
    DOMAIN: ${env:DOMAIN}

functions:
  register:
    handler: dist/auth-handler.register
    events:
      - http:
          path: /auth/register
          method: post
          cors: true

  login:
    handler: dist/auth-handler.login
    events:
      - http:
          path: /auth/login
          method: post
          cors: true

plugins:
  - serverless-plugin-typescript
```

### 4. Deploy
```bash
npm run build
serverless deploy
```