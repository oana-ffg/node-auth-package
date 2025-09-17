import { z } from 'zod';

export interface ValidationConfig {
  passwordMinLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
}

export class AuthSchemas {
  private validationConfig: ValidationConfig;

  constructor(validationConfig: ValidationConfig) {
    this.validationConfig = validationConfig;
  }

  public get registerSchema() {
    let passwordSchema = z.string()
      .min(this.validationConfig.passwordMinLength, `Password must be at least ${this.validationConfig.passwordMinLength} characters`);

    if (this.validationConfig.requireUppercase) {
      passwordSchema = passwordSchema.regex(/[A-Z]/, 'Password must contain at least one uppercase letter');
    }
    if (this.validationConfig.requireNumber) {
      passwordSchema = passwordSchema.regex(/[0-9]/, 'Password must contain at least one number');
    }
    if (this.validationConfig.requireSpecialChar) {
      passwordSchema = passwordSchema.regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');
    }

    return z.object({
      email: z.string().email(),
      password: passwordSchema,
    });
  }

  public get loginSchema() {
    return z.object({
      email: z.string().email(),
      password: z.string(),
    });
  }

  public get login2FASchema() {
    return z.object({
      otp: z.string().length(6, { message: 'OTP must be exactly 6 digits.' }),
      tempToken: z.string().min(1, { message: 'Temporary token is required.' }),
    });
  }

  public get refreshSchema() {
    return z.object({
      refreshToken: z.string().min(1, { message: 'Refresh token is required.' }),
    });
  }

  public get confirm2FASchema() {
    return z.object({
      otp: z.string().length(6, { message: 'OTP must be exactly 6 digits.' }),
    });
  }

  public get reset2FASchema() {
    return z.object({
      password: z.string().min(1, { message: 'Password is required.' }),
    });
  }

  public get disable2FASchema() {
    return z.object({
      password: z.string().min(1, { message: 'Password is required.' }),
    });
  }

  public get generate2FASchema() {
    return z.object({
      password: z.string().min(1, { message: 'Password is required for 2FA management.' }),
    });
  }

  public get deleteAccountSchema() {
    return z.object({
      password: z.string().min(1, { message: 'Password is required to delete account.' }),
    });
  }

  public get passkeyRegistrationStartSchema() {
    return z.object({
      password: z.string().min(1, { message: 'Password is required for passkey registration.' }),
      name: z.string().optional(),
    });
  }

  public get passkeyRegistrationCompleteSchema() {
    // Base64url regex pattern (no padding, URL-safe characters)
    const base64urlRegex = /^[A-Za-z0-9_-]+$/;

    return z.object({
      credential: z.object({
        id: z.string().regex(base64urlRegex, 'id must be base64url encoded'),
        rawId: z.string().regex(base64urlRegex, 'rawId must be base64url encoded'),
        response: z.object({
          attestationObject: z.string().regex(base64urlRegex, 'attestationObject must be base64url encoded'),
          clientDataJSON: z.string().regex(base64urlRegex, 'clientDataJSON must be base64url encoded'),
          transports: z.array(z.enum(['usb', 'nfc', 'ble', 'internal', 'hybrid', 'cable'])).optional(),
        }),
        type: z.literal('public-key'),
        clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
        authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
      }),
      name: z.string().optional(),
    });
  }

  public get passkeyAuthenticationStartSchema() {
    return z.object({
      email: z.string().email().optional(),
    });
  }

  public get passkeyAuthenticationCompleteSchema() {
    return z.object({
      credential: z.object({
        id: z.string(),
        rawId: z.string(),
        response: z.object({
          authenticatorData: z.string(),
          clientDataJSON: z.string(),
          signature: z.string(),
          userHandle: z.string().nullable().optional(),
        }),
        type: z.literal('public-key'),
        clientExtensionResults: z.object({}).optional(),
        authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
      }),
    });
  }

  public get passkeyDeleteSchema() {
    return z.object({
      passkeyId: z.string().min(1, { message: 'Passkey ID is required.' }),
      password: z.string().min(1, { message: 'Password is required to delete passkey.' }),
    });
  }

  public get passkeyRenameSchema() {
    return z.object({
      passkeyId: z.string().min(1, { message: 'Passkey ID is required.' }),
      name: z.string().min(1, { message: 'Passkey name is required.' }).max(50, { message: 'Passkey name must be 50 characters or less.' }),
    });
  }
}

// Backwards compatibility - create schemas with default config
const defaultConfig: ValidationConfig = {
  passwordMinLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialChar: true,
};

const defaultSchemas = new AuthSchemas(defaultConfig);

export const registerSchema = defaultSchemas.registerSchema;
export const loginSchema = defaultSchemas.loginSchema;
export const login2FASchema = defaultSchemas.login2FASchema;
export const refreshSchema = defaultSchemas.refreshSchema;
export const confirm2FASchema = defaultSchemas.confirm2FASchema;
export const reset2FASchema = defaultSchemas.reset2FASchema;
export const disable2FASchema = defaultSchemas.disable2FASchema;
export const generate2FASchema = defaultSchemas.generate2FASchema;
export const deleteAccountSchema = defaultSchemas.deleteAccountSchema;
export const passkeyRegistrationStartSchema = defaultSchemas.passkeyRegistrationStartSchema;
export const passkeyRegistrationCompleteSchema = defaultSchemas.passkeyRegistrationCompleteSchema;
export const passkeyAuthenticationStartSchema = defaultSchemas.passkeyAuthenticationStartSchema;
export const passkeyAuthenticationCompleteSchema = defaultSchemas.passkeyAuthenticationCompleteSchema;
export const passkeyDeleteSchema = defaultSchemas.passkeyDeleteSchema;
export const passkeyRenameSchema = defaultSchemas.passkeyRenameSchema;