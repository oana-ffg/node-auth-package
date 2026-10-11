import { Request, Response, RequestHandler } from 'express';
import { FirefunAuth, FirefunAuthConfig } from './index';
import { ErrorHandler, AppError } from './utils/errorHandler';

// Reuse the same configuration object across warm invocations. The weak cache
// preserves limiter counters without keeping unused configurations alive.
type EndpointHandler = (req: Request, res: Response) => Promise<unknown>;

const instances = new WeakMap<FirefunAuthConfig, FirefunAuth>();
function getAuth(config: FirefunAuthConfig): FirefunAuth {
  let auth = instances.get(config);
  if (!auth) {
    auth = new FirefunAuth({ ...config, serverless: true });
    instances.set(config, auth);
  }
  return auth;
}

// Middleware can complete a response without calling next (401/429). In that
// case the endpoint must settle without running its controller.
function runMiddleware(middleware: RequestHandler, req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const finish = (allowed: boolean, error?: unknown) => {
      res.removeListener('finish', ended);
      res.removeListener('close', ended);
      if (error) reject(error);
      else resolve(allowed);
    };
    const ended = () => finish(false);
    res.on('finish', ended);
    res.on('close', ended);
    try {
      Promise.resolve(middleware(req, res, error => finish(!error, error)))
        .catch(error => finish(false, error));
    } catch (error) {
      finish(false, error);
    }
  });
}

/**
 * Vercel-compatible body handler for serverless environments
 * Handles different body formats that may be encountered in serverless runtimes
 */
function ensureJSONBody(req: Request): void {
  if (req.body === undefined || req.body === null) {
    req.body = {};
    return;
  }
  try {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    req.body = parsed;
  } catch {
    // Never include body contents or parser errors: they can contain passwords.
    throw new AppError('Invalid JSON body', 400, true, {
      reason: 'Request body must be a JSON object',
      help: 'Send a JSON object with Content-Type: application/json.'
    });
  }
}

function createServerlessFunction(
  controllerName: 'authController' | 'passkeyController',
  handlerName: string
) {
  return async (req: Request, res: Response, config: FirefunAuthConfig) => {
    try {
      ensureJSONBody(req);
      const controller = getAuth(config)[controllerName];
      const handler = (controller as unknown as Record<string, EndpointHandler>)[handlerName].bind(controller);
      return await handler(req, res);
    } catch (error) {
      return ErrorHandler.handleError(error, res, `serverless ${controllerName} - ${handlerName}`);
    }
  };
}

function createServerlessAuthFunction(handlerName: keyof FirefunAuth['authController']) {
  return createServerlessFunction('authController', handlerName);
}

function createServerlessPasskeyFunction(handlerName: keyof FirefunAuth['passkeyController']) {
  return createServerlessFunction('passkeyController', handlerName);
}

// Auth function exports
export const registerUser = createServerlessAuthFunction('registerUser');
export const loginUser = createServerlessAuthFunction('loginUser');
export const loginWith2FA = createServerlessAuthFunction('loginWith2FA');
export const refreshTokenHandler = createServerlessAuthFunction('refreshTokenHandler');
export const generate2FASecret = createServerlessAuthFunction('generate2FASecret');
export const confirm2FA = createServerlessAuthFunction('confirm2FA');
export const reset2FA = createServerlessAuthFunction('reset2FA');
export const disable2FA = createServerlessAuthFunction('disable2FA');
export const deleteAccount = createServerlessAuthFunction('deleteAccount');

// Passkey function exports
export const startPasskeyRegistration = createServerlessPasskeyFunction('startPasskeyRegistration');
export const completePasskeyRegistration = createServerlessPasskeyFunction('completePasskeyRegistration');
export const startPasskeyAuthentication = createServerlessPasskeyFunction('startPasskeyAuthentication');
export const completePasskeyAuthentication = createServerlessPasskeyFunction('completePasskeyAuthentication');
export const listPasskeys = createServerlessPasskeyFunction('listPasskeys');
export const deletePasskey = createServerlessPasskeyFunction('deletePasskey');
export const renamePasskey = createServerlessPasskeyFunction('renamePasskey');

/**
 * Creates an auth middleware function for serverless environments
 * @param config - FirefunAuth configuration
 * @returns Middleware function
 */
export function createServerlessAuthMiddleware(config: FirefunAuthConfig) {
  return getAuth(config).getAuthMiddleware();
}

/**
 * Creates rate limiting middleware for serverless environments
 * @param config - FirefunAuth configuration
 * @returns Rate limiting middleware object
 */
export function createServerlessRateLimitMiddleware(config: FirefunAuthConfig) {
  const auth = getAuth(config);
  return auth.getRateLimitMiddleware();
}

/**
 * Triggers cleanup in serverless environment
 * @param config - FirefunAuth configuration
 * @returns Cleanup results
 */
export async function performServerlessCleanup(config: FirefunAuthConfig) {
  const auth = getAuth(config);
  return auth.performCleanup();
}

/**
 * Utility function to create a complete serverless handler with middleware
 * @param handlerName - The handler function to wrap
 * @param requiresAuth - Whether the endpoint requires authentication
 * @param rateLimitType - Type of rate limiting to apply ('general', 'auth', 'twoFA')
 * @returns Complete serverless handler with middleware
 */
export function createServerlessHandler(
  handlerName: string,
  requiresAuth: boolean = false,
  rateLimitType?: 'general' | 'auth' | 'twoFA'
) {
  return async (req: Request, res: Response, config: FirefunAuthConfig) => {
    try {
      const auth = getAuth(config);
      // Ensure JSON body is parsed for serverless environments
      ensureJSONBody(req);

      // Apply rate limiting if specified
      if (rateLimitType) {
        const rateLimits = auth.getRateLimitMiddleware();
        const rateLimitMiddleware = rateLimits[rateLimitType];

        if (!await runMiddleware(rateLimitMiddleware, req, res)) return;
      }

      // Apply auth middleware if required
      if (requiresAuth && !await runMiddleware(auth.getAuthMiddleware(), req, res)) return;

      // Execute the handler
      const isPasskeyHandler = handlerName.includes('Passkey') || handlerName.includes('passkey');
      const controller = isPasskeyHandler ? auth.passkeyController : auth.authController;
      const handler = (controller as unknown as Record<string, EndpointHandler>)[handlerName].bind(controller);

      return await handler(req, res);
    } catch (error) {
      return ErrorHandler.handleError(error, res, `serverless handler - ${handlerName}`);
    }
  };
}

// Pre-configured handlers with middleware
export const registerUserWithRateLimit = createServerlessHandler('registerUser', false, 'auth');
export const loginUserWithRateLimit = createServerlessHandler('loginUser', false, 'auth');
export const loginWith2FAWithRateLimit = createServerlessHandler('loginWith2FA', false, 'auth');
export const refreshTokenWithRateLimit = createServerlessHandler('refreshTokenHandler', false, 'auth');

export const generate2FASecretWithAuth = createServerlessHandler('generate2FASecret', true, 'twoFA');
export const confirm2FAWithAuth = createServerlessHandler('confirm2FA', true, 'twoFA');
export const reset2FAWithAuth = createServerlessHandler('reset2FA', true, 'twoFA');
export const disable2FAWithAuth = createServerlessHandler('disable2FA', true, 'twoFA');
export const deleteAccountWithAuth = createServerlessHandler('deleteAccount', true);

export const startPasskeyRegistrationWithAuth = createServerlessHandler('startPasskeyRegistration', true);
export const completePasskeyRegistrationWithAuth = createServerlessHandler('completePasskeyRegistration', true);
export const listPasskeysWithAuth = createServerlessHandler('listPasskeys', true);
export const deletePasskeyWithAuth = createServerlessHandler('deletePasskey', true);
export const renamePasskeyWithAuth = createServerlessHandler('renamePasskey', true);

// Export utility functions for testing
export { ensureJSONBody, createServerlessAuthFunction, createServerlessPasskeyFunction };