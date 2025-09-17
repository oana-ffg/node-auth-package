import { Request, Response, NextFunction } from 'express';
import { FirefunAuth, FirefunAuthConfig } from './index';

/**
 * Creates a serverless-optimized function handler
 * @param handlerName - The method name on AuthController to call
 * @returns Function that can be used as a serverless endpoint
 */
function createServerlessAuthFunction(handlerName: keyof FirefunAuth['authController']) {
  return async (req: Request, res: Response, config: FirefunAuthConfig) => {
    const auth = new FirefunAuth({ ...config, serverless: true });
    const handler = (auth.authController as any)[handlerName].bind(auth.authController);
    return await handler(req, res);
  };
}

/**
 * Creates a serverless-optimized passkey function handler
 * @param handlerName - The method name on PasskeyController to call
 * @returns Function that can be used as a serverless endpoint
 */
function createServerlessPasskeyFunction(handlerName: keyof FirefunAuth['passkeyController']) {
  return async (req: Request, res: Response, config: FirefunAuthConfig) => {
    const auth = new FirefunAuth({ ...config, serverless: true });
    const handler = (auth.passkeyController as any)[handlerName].bind(auth.passkeyController);
    return await handler(req, res);
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
      console.error(`Serverless handler error for ${handlerName}:`, error);
      return res.status(500).json({ error: 'Internal server error' });
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