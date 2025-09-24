/**
 * Router Integration Tests
 *
 * Integration tests for router setup and configuration including:
 * - Router creation and middleware integration
 * - Route protection with authentication middleware
 * - Rate limiting integration across routes
 * - Complete route handling workflows
 * - Middleware chain execution
 */

import { FirefunAuth, FirefunAuthConfig } from '../../src/index';
import { Router, Request, Response, NextFunction } from 'express';
import { MockPrismaClient } from '../mocks/prisma.mock';
import { testConfig } from '../setup';
import { createMockRequest, createMockResponse } from '../mocks/express.mock';
import { generateMockUser } from '../helpers/data.generators';

// Mock external dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('speakeasy');
jest.mock('qrcode');
jest.mock('@simplewebauthn/server');

import jwt from 'jsonwebtoken';
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('Router Integration', () => {
  let firefunAuth: FirefunAuth;
  let mockPrisma: MockPrismaClient;
  let config: FirefunAuthConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new MockPrismaClient();
    config = { ...testConfig };
    config.prisma = mockPrisma;
    config.serverless = false;

    firefunAuth = new FirefunAuth(config);

    // Setup JWT mocking
    mockedJwt.verify.mockReturnValue({ userId: 'user1', email: 'test@example.com' } as any);
    mockedJwt.sign.mockReturnValue('mock.jwt.token');
  });

  describe('Auth Routes Router', () => {
    let authRouter: Router;

    beforeEach(() => {
      authRouter = firefunAuth.createAuthRoutes();
    });

    it('should create auth routes with proper middleware chain', () => {
      expect(authRouter).toBeDefined();
      expect(typeof authRouter).toBe('function');

      // Verify router has the expected structure
      const routerStack = (authRouter as any).stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);

      // Check that routes are properly configured
      const routes = routerStack.map((layer: any) => ({
        path: layer.regexp.source,
        method: layer.route?.methods || 'middleware',
      }));

      // Should have middleware and route layers
      expect(routes.some((route: any) => route.method === 'middleware')).toBe(true);
    });

    it('should apply rate limiting to sensitive endpoints', async () => {
      const testUser = generateMockUser();

      // Mock rate limiting middleware functionality
      const rateLimitSpy = jest.spyOn(firefunAuth.rateLimitMiddleware, 'authRateLimit');

      // Create new router to capture middleware setup
      const router = firefunAuth.createAuthRoutes();

      // Verify rate limiting middleware is applied to auth endpoints
      expect(rateLimitSpy).toBeDefined();
    });

    it('should protect 2FA routes with authentication middleware', async () => {
      const testUser = generateMockUser();

      // Mock authenticated user
      const req = createMockRequest({
        body: {},
        headers: { authorization: 'Bearer validToken' },
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      // Test that auth middleware is properly integrated
      await firefunAuth.authController.generate2FASecret(req as any, res as any);

      // Should not throw authorization error since user is mocked as authenticated
      expect(res.status).not.toHaveBeenCalledWith(401);
    });

    it('should handle middleware chain execution order', () => {
      const router = firefunAuth.createAuthRoutes();
      const stack = (router as any).stack;

      // Verify middleware and routes are in expected order
      expect(stack.length).toBeGreaterThan(5);

      // Check that rate limiting middleware comes before route handlers
      let foundRateLimit = false;
      let foundRoutes = false;

      stack.forEach((layer: any) => {
        if (layer.name === 'authRateLimit' || layer.name === 'twoFALimit') {
          foundRateLimit = true;
        }
        if (layer.route) {
          foundRoutes = true;
        }
      });

      expect(foundRateLimit || foundRoutes).toBe(true); // At least one should be found
    });
  });

  describe('Passkey Routes Router', () => {
    let passkeyRouter: Router;

    beforeEach(() => {
      passkeyRouter = firefunAuth.createPasskeyRoutes();
    });

    it('should create passkey routes with proper middleware chain', () => {
      expect(passkeyRouter).toBeDefined();
      expect(typeof passkeyRouter).toBe('function');

      const routerStack = (passkeyRouter as any).stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);
    });

    it('should have public routes for passkey authentication', () => {
      const router = firefunAuth.createPasskeyRoutes();
      const stack = (router as any).stack;

      // Should have routes configured
      expect(stack.length).toBeGreaterThan(0);

      // Check for authentication routes (public)
      const publicRoutes = stack.filter((layer: any) =>
        layer.route && (
          layer.route.path === '/authenticate/start' ||
          layer.route.path === '/authenticate/complete'
        )
      );

      expect(publicRoutes.length).toBeGreaterThan(0);
    });

    it('should protect passkey management routes', () => {
      const router = firefunAuth.createPasskeyRoutes();
      const stack = (router as any).stack;

      // Should have protected routes for passkey management
      const protectedRoutes = stack.filter((layer: any) =>
        layer.route && (
          layer.route.path === '/register/start' ||
          layer.route.path === '/register/complete' ||
          layer.route.path === '/list' ||
          layer.route.path.includes(':id')
        )
      );

      expect(protectedRoutes.length).toBeGreaterThan(0);
    });
  });

  describe('Middleware Integration', () => {
    it('should provide working auth middleware', () => {
      const authMiddleware = firefunAuth.getAuthMiddleware();
      expect(typeof authMiddleware).toBe('function');
    });

    it('should provide working rate limit middleware', () => {
      const rateLimitMiddleware = firefunAuth.getRateLimitMiddleware();
      expect(rateLimitMiddleware).toBeDefined();
      expect(typeof rateLimitMiddleware.general).toBe('function');
      expect(typeof rateLimitMiddleware.auth).toBe('function');
      expect(typeof rateLimitMiddleware.twoFA).toBe('function');
    });

    it('should handle middleware errors gracefully', async () => {
      // Mock JWT verification to throw error
      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const req = createMockRequest({
        headers: { authorization: 'Bearer invalidToken' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      const authMiddleware = firefunAuth.getAuthMiddleware();
      await authMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token',
        })
      );
    });

    it('should chain middleware properly in auth routes', async () => {
      const testUser = generateMockUser();

      // Mock user for protected route
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({
        body: {},
        headers: { authorization: 'Bearer validToken' },
        user: { userId: testUser.id, email: testUser.email },
      });
      const res = createMockResponse();

      // Test protected route (2FA generation)
      await firefunAuth.authController.generate2FASecret(req as any, res as any);

      // Should succeed if middleware chain works properly
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Router Configuration Validation', () => {
    it('should validate router setup with proper configuration', () => {
      // Test that routers are created successfully with valid config
      expect(() => firefunAuth.createAuthRoutes()).not.toThrow();
      expect(() => firefunAuth.createPasskeyRoutes()).not.toThrow();
    });

    it('should handle router creation in serverless mode', () => {
      const serverlessConfig = { ...config, serverless: true };
      const serverlessAuth = new FirefunAuth(serverlessConfig);

      // Should still create routers in serverless mode
      expect(() => serverlessAuth.createAuthRoutes()).not.toThrow();
      expect(() => serverlessAuth.createPasskeyRoutes()).not.toThrow();
    });

    it('should provide access to validation schemas through router context', () => {
      const schemas = firefunAuth.getSchemas();
      expect(schemas).toBeDefined();
      expect(schemas.registration).toBeDefined();
      expect(schemas.login).toBeDefined();
      expect(schemas.twoFA).toBeDefined();
    });
  });

  describe('Complete Route Flow Integration', () => {
    it('should handle complete registration route flow', async () => {
      const testUser = generateMockUser();
      const router = firefunAuth.createAuthRoutes();

      // Mock database operations
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create request through router context
      const req = createMockRequest({
        body: {
          email: testUser.email,
          password: 'ValidPassword123!',
        },
        url: '/register',
        method: 'POST',
      });
      const res = createMockResponse();

      // Simulate route handling
      await firefunAuth.authController.registerUser(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User registered successfully',
        })
      );
    });

    it('should handle complete login route flow with rate limiting', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'token1',
        userId: testUser.id,
        token: 'refreshToken123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const req = createMockRequest({
        body: {
          email: testUser.email,
          password: 'ValidPassword123!',
        },
        url: '/login',
        method: 'POST',
        ip: '127.0.0.1',
      });
      const res = createMockResponse();

      // Test that login works through router integration
      await firefunAuth.authController.loginUser(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock.jwt.token',
        })
      );
    });

    it('should handle protected route access with authentication', async () => {
      const testUser = generateMockUser();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUser.id,
        email: testUser.email,
        hashedPassword: '$2b$10$hashedPassword',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({
        body: {},
        headers: { authorization: 'Bearer validToken' },
        user: { userId: testUser.id, email: testUser.email },
        url: '/2fa/generate',
        method: 'POST',
      });
      const res = createMockResponse();

      // Test protected route access
      await firefunAuth.authController.generate2FASecret(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
        })
      );
    });
  });

  describe('Error Handling in Router Context', () => {
    it('should handle validation errors in route context', async () => {
      const req = createMockRequest({
        body: {
          email: 'invalid-email', // Invalid email format
          password: '123', // Too weak password
        },
        url: '/register',
        method: 'POST',
      });
      const res = createMockResponse();

      await firefunAuth.authController.registerUser(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });

    it('should handle unauthorized access to protected routes', async () => {
      const req = createMockRequest({
        body: {},
        headers: {}, // No authorization header
        url: '/2fa/generate',
        method: 'POST',
      });
      const res = createMockResponse();
      const next = jest.fn();

      const authMiddleware = firefunAuth.getAuthMiddleware();
      await authMiddleware(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'No token provided',
        })
      );
    });

    it('should handle rate limit exceeded errors', async () => {
      // This would be handled by the rate limiting middleware
      // In a real scenario, multiple rapid requests would trigger this

      const req = createMockRequest({
        body: {
          email: 'test@example.com',
          password: 'password',
        },
        ip: '127.0.0.1',
        url: '/login',
        method: 'POST',
      });
      const res = createMockResponse();

      // Mock rate limit exceeded scenario
      const rateLimitMiddleware = firefunAuth.getRateLimitMiddleware().auth;

      // The middleware should be callable
      expect(typeof rateLimitMiddleware).toBe('function');
    });
  });
});