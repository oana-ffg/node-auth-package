import { Request, Response, NextFunction } from 'express';
import { FirefunAuth, FirefunAuthConfig } from './index';
import { ErrorHandler, AppError } from './utils/errorHandler';

/**
 * Ensures request body is properly parsed as JSON for Vercel serverless functions
 * Vercel automatically parses JSON bodies, so this mainly validates the body exists
 */
function ensureJSONBody(req: Request): void {
  // Minimal debug logging to match optimized endpoint approach
  console.log('Auth Body type:', typeof req.body, 'Email:', req.body?.email, 'Password exists:', !!req.body?.password);

  // Handle different body formats (same logic as working direct endpoint)
  if (req.body && typeof req.body === 'object') {
    // Body is already parsed - this is the normal Vercel case
    return;
  }

  if (typeof req.body === 'string') {
    try {
      if (req.body.trim() === '') {
        req.body = {};
        return;
      }
      req.body = JSON.parse(req.body);
    } catch (parseError) {
      throw new AppError('Invalid JSON in request body', 400, true, {
        reason: 'Request body could not be parsed as JSON',
        help: 'Ensure you are sending valid JSON with Content-Type: application/json',
        details: `Body received: ${req.body.substring(0, 200)}${req.body.length > 200 ? '...' : ''}`
      });
    }
    return;
  }

  if (req.body === undefined || req.body === null) {
    req.body = {};
    return;
  }

  // For any other type, throw an error
  throw new AppError('Unexpected request body format', 400, true, {
    reason: `Request body type '${typeof req.body}' is not supported`,
    help: 'Ensure you are sending JSON with Content-Type: application/json',
    details: `Body type: ${typeof req.body}`
  });
}

/**
 * Creates a serverless-optimized function handler
 * @param handlerName - The method name on AuthController to call
 * @returns Function that can be used as a serverless endpoint
 */
function createServerlessAuthFunction(handlerName: keyof FirefunAuth['authController']) {
  return async (req: Request, res: Response, config: FirefunAuthConfig) => {
    try {
      // Ensure JSON body is parsed for serverless environments
      ensureJSONBody(req);

      const auth = new FirefunAuth({ ...config, serverless: true });
      const handler = (auth.authController as any)[handlerName].bind(auth.authController);
      return await handler(req, res);
    } catch (error) {
      return ErrorHandler.handleError(error, res, `serverless auth function - ${handlerName}`);
    }
  };
}

/**
 * Creates a serverless-optimized passkey function handler
 * @param handlerName - The method name on PasskeyController to call
 * @returns Function that can be used as a serverless endpoint
 */
function createServerlessPasskeyFunction(handlerName: keyof FirefunAuth['passkeyController']) {
  return async (req: Request, res: Response, config: FirefunAuthConfig) => {
    try {
      // Ensure JSON body is parsed for serverless environments
      ensureJSONBody(req);

      const auth = new FirefunAuth({ ...config, serverless: true });
      const handler = (auth.passkeyController as any)[handlerName].bind(auth.passkeyController);
      return await handler(req, res);
    } catch (error) {
      return ErrorHandler.handleError(error, res, `serverless passkey function - ${handlerName}`);
    }
  };
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
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = new FirefunAuth({ ...config, serverless: true });
    return auth.getAuthMiddleware()(req, res, next);
  };
}

/**
 * Creates rate limiting middleware for serverless environments
 * @param config - FirefunAuth configuration
 * @returns Rate limiting middleware object
 */
export function createServerlessRateLimitMiddleware(config: FirefunAuthConfig) {
  const auth = new FirefunAuth({ ...config, serverless: true });
  return auth.getRateLimitMiddleware();
}

/**
 * Triggers cleanup in serverless environment
 * @param config - FirefunAuth configuration
 * @returns Cleanup results
 */
export async function performServerlessCleanup(config: FirefunAuthConfig) {
  const auth = new FirefunAuth({ ...config, serverless: true });
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
    const auth = new FirefunAuth({ ...config, serverless: true });

    try {
      // Ensure JSON body is parsed for serverless environments
      ensureJSONBody(req);

      // Apply rate limiting if specified
      if (rateLimitType) {
        const rateLimits = auth.getRateLimitMiddleware();
        const rateLimitMiddleware = rateLimits[rateLimitType];

        // Apply rate limiting
        await new Promise<void>((resolve, reject) => {
          rateLimitMiddleware(req, res, (err?: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Apply auth middleware if required
      if (requiresAuth) {
        await new Promise<void>((resolve, reject) => {
          auth.getAuthMiddleware()(req, res, (err?: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Execute the handler
      const isPasskeyHandler = handlerName.includes('Passkey') || handlerName.includes('passkey');
      const controller = isPasskeyHandler ? auth.passkeyController : auth.authController;
      const handler = (controller as any)[handlerName].bind(controller);

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