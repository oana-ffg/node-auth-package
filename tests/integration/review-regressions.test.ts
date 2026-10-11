import express, { Request, Response } from 'express';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { FirefunAuth, FirefunAuthConfig } from '../../src/index';
import { createServerlessHandler, ensureJSONBody } from '../../src/serverless';
import { EncryptionUtil, deserializeEncryptedData } from '../../src/utils/encryption';
import { testConfig } from '../setup';

let server: Server | undefined;
let base: string;
async function serve(app: express.Express) {
  server = await new Promise<Server>(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${(server!.address() as any).port}`;
}
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    const active = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => active.close(error => error ? reject(error) : resolve()));
  }
});
function config(prisma: any = {}): FirefunAuthConfig {
  return {
    ...testConfig, prisma,
    jwt: { ...testConfig.jwt, secret: randomBytes(32).toString('hex') },
    encryption: { keys: { v1: randomBytes(32).toString('hex') }, currentVersion: 'v1', pbkdf2Iterations: 1 },
    rateLimiting: {
      general: { windowMs: 60000, maxRequests: 2, message: 'Limited' },
      auth: { windowMs: 60000, maxRequests: 2, message: 'Limited' },
      twoFA: { windowMs: 60000, maxRequests: 2, message: 'Limited' },
    },
  };
}

test('Express 5 can build auth routes and preserves the 2FA limiter', async () => {
  const auth = new FirefunAuth(config());
  const app = express();
  app.use(auth.createAuthRoutes());
  await serve(app);
  for (let i = 0; i < 2; i++) {
    expect((await fetch(`${base}/2fa/generate`, { method: 'POST' })).status).toBe(401);
  }
  expect((await fetch(`${base}/2fa/generate`, { method: 'POST' })).status).toBe(429);
});

test('serverless bodyless GET passes authentication and lists passkeys', async () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const cfg = config({ passkey: { findMany } });
  const handler = createServerlessHandler('listPasskeys', true);
  const app = express();
  app.get('/', (req, res) => { void handler(req, res, cfg); });
  await serve(app);
  const token = jwt.sign({ userId: 'synthetic-user' }, cfg.jwt.secret);
  const response = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status).toBe(200);
  expect(findMany).toHaveBeenCalledTimes(1);
});

test('serverless 401 settles without calling the controller', async () => {
  const findMany = jest.fn();
  const cfg = config({ passkey: { findMany } });
  const handler = createServerlessHandler('listPasskeys', true);
  let settled = false;
  const app = express();
  app.get('/', async (req, res) => {
    await handler(req, res, cfg);
    settled = true;
  });
  await serve(app);
  expect((await fetch(base)).status).toBe(401);
  await new Promise(resolve => setImmediate(resolve));
  expect(settled).toBe(true);
  expect(findMany).not.toHaveBeenCalled();
});

test('serverless limit survives warm invocations and 429 settles', async () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const cfg = config({ passkey: { findMany } });
  const handler = createServerlessHandler('listPasskeys', false, 'general');
  const app = express();
  let settled = 0;
  app.get('/', async (req, res) => { await handler(req, res, cfg); settled++; });
  await serve(app);
  for (let i = 0; i < 2; i++) expect((await fetch(base)).status).toBe(401);
  expect((await fetch(base)).status).toBe(429);
  await new Promise(resolve => setImmediate(resolve));
  expect(settled).toBe(3);
  expect(findMany).not.toHaveBeenCalled();
});

test('parses escaped passwords and buffers without leaking malformed bodies', () => {
  const password = 'a"\\b\n!';
  const req = { body: Buffer.from(JSON.stringify({ password })) } as Request;
  ensureJSONBody(req);
  expect(req.body.password).toBe(password);
  const malformed = { body: '{"password":"private-test-secret",' } as Request;
  try {
    ensureJSONBody(malformed);
    throw new Error('Expected malformed JSON to fail');
  } catch (error: any) {
    expect(error.message).toBe('Invalid JSON body');
    expect(JSON.stringify(error)).not.toContain('private-test-secret');
  }
});

test('each controller uses its own encryption even after another instance initializes', async () => {
  const updates: any[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'synthetic-user', email: 'test@example.com', password: bcrypt.hashSync('Synthetic1!', 4), twoFactorEnabled: false }),
      update: jest.fn().mockImplementation(async (data) => { updates.push(data); return {}; }),
    },
  };
  const first = new FirefunAuth(config(prisma));
  const controller = first.authController;
  const second = new FirefunAuth(config(prisma));
  void second.authController;
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
  await controller.generate2FASecret({ body: { password: 'Synthetic1!' }, userId: 'synthetic-user' } as any, res);
  expect(updates).toHaveLength(1);
  const stored = updates[0].data;
  const secret = deserializeEncryptedData(stored.twoFactorSecret);
  const firstEncryption = new EncryptionUtil((first as any).config.encryption);
  const secondEncryption = new EncryptionUtil((second as any).config.encryption);
  expect(firstEncryption.decrypt2FASecret(secret, stored.encryptionVersion)).toMatch(/^[A-Z2-7]+$/);
  expect(() => secondEncryption.decrypt2FASecret(secret, stored.encryptionVersion)).toThrow();
});
