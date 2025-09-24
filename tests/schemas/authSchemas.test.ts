/**
 * Tests for authentication schemas validation
 * Covers all Zod schemas with valid/invalid inputs and edge cases
 */

import {
  AuthSchemas,
  ValidationConfig,
  registerSchema,
  loginSchema,
  login2FASchema,
  refreshSchema,
  confirm2FASchema,
  reset2FASchema,
  disable2FASchema,
  generate2FASchema,
  deleteAccountSchema,
  passkeyRegistrationStartSchema,
  passkeyRegistrationCompleteSchema,
  passkeyAuthenticationStartSchema,
  passkeyAuthenticationCompleteSchema,
  passkeyDeleteSchema,
  passkeyRenameSchema
} from '../../src/schemas/authSchemas';
import {
  validEmails,
  invalidEmails,
  validPasswords,
  invalidPasswords,
  valid2FATokens,
  invalid2FATokens,
  validRefreshTokens,
  invalidRefreshTokens,
  passwordComplexityTests,
  emailEdgeCases
} from '../fixtures/validation.fixtures';

describe('AuthSchemas', () => {
  let authSchemas: AuthSchemas;
  let testConfig: ValidationConfig;

  beforeEach(() => {
    testConfig = {
      passwordMinLength: 8,
      requireUppercase: true,
      requireNumber: true,
      requireSpecialChar: true
    };
    authSchemas = new AuthSchemas(testConfig);
  });

  describe('registerSchema', () => {
    describe('valid registrations', () => {
      it('should accept valid email and password combinations', () => {
        validEmails.forEach(email => {
          validPasswords.forEach(password => {
            const result = authSchemas.registerSchema.safeParse({
              email,
              password
            });

            expect(result.success).toBe(true);
          });
        });
      });

      it('should accept minimum valid password', () => {
        const result = authSchemas.registerSchema.safeParse({
          email: 'test@example.com',
          password: 'TestP@ss1' // 8 chars, has uppercase, number, special char
        });

        expect(result.success).toBe(true);
      });
    });

    describe('invalid registrations', () => {
      it('should reject invalid emails', () => {
        invalidEmails.forEach(email => {
          const result = authSchemas.registerSchema.safeParse({
            email,
            password: 'ValidPass123!'
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some(issue =>
              issue.path.includes('email')
            )).toBe(true);
          }
        });
      });

      it('should reject invalid passwords', () => {
        invalidPasswords.forEach(password => {
          const result = authSchemas.registerSchema.safeParse({
            email: 'test@example.com',
            password
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some(issue =>
              issue.path.includes('password')
            )).toBe(true);
          }
        });
      });

      it('should reject missing fields', () => {
        const testCases = [
          {}, // Both missing
          { email: 'test@example.com' }, // Password missing
          { password: 'ValidPass123!' } // Email missing
        ];

        testCases.forEach(testCase => {
          const result = authSchemas.registerSchema.safeParse(testCase);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('password complexity requirements', () => {
      it('should enforce minimum length', () => {
        passwordComplexityTests.length.tooShort.forEach(password => {
          const result = authSchemas.registerSchema.safeParse({
            email: 'test@example.com',
            password
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some(issue =>
              issue.message.includes('at least 8 characters')
            )).toBe(true);
          }
        });
      });

      it('should enforce uppercase requirement', () => {
        passwordComplexityTests.uppercase.missing.forEach(password => {
          const result = authSchemas.registerSchema.safeParse({
            email: 'test@example.com',
            password
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some(issue =>
              issue.message.includes('uppercase letter')
            )).toBe(true);
          }
        });
      });

      it('should enforce number requirement', () => {
        passwordComplexityTests.numbers.missing.forEach(password => {
          const result = authSchemas.registerSchema.safeParse({
            email: 'test@example.com',
            password
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some(issue =>
              issue.message.includes('one number')
            )).toBe(true);
          }
        });
      });

      it('should enforce special character requirement', () => {
        passwordComplexityTests.specialChars.missing.forEach(password => {
          const result = authSchemas.registerSchema.safeParse({
            email: 'test@example.com',
            password
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.issues.some(issue =>
              issue.message.includes('special character')
            )).toBe(true);
          }
        });
      });

      it('should accept valid special characters', () => {
        passwordComplexityTests.specialChars.validSpecialChars.forEach(specialChar => {
          const password = `TestPass123${specialChar}`;
          const result = authSchemas.registerSchema.safeParse({
            email: 'test@example.com',
            password
          });

          expect(result.success).toBe(true);
        });
      });
    });

    describe('configurable password requirements', () => {
      it('should work with relaxed requirements', () => {
        const relaxedConfig: ValidationConfig = {
          passwordMinLength: 6,
          requireUppercase: false,
          requireNumber: false,
          requireSpecialChar: false
        };
        const relaxedSchemas = new AuthSchemas(relaxedConfig);

        const result = relaxedSchemas.registerSchema.safeParse({
          email: 'test@example.com',
          password: 'simple' // 6 chars, no special requirements
        });

        expect(result.success).toBe(true);
      });

      it('should work with different minimum length', () => {
        const strictConfig: ValidationConfig = {
          passwordMinLength: 12,
          requireUppercase: true,
          requireNumber: true,
          requireSpecialChar: true
        };
        const strictSchemas = new AuthSchemas(strictConfig);

        // Should fail with 8-char password
        const shortResult = strictSchemas.registerSchema.safeParse({
          email: 'test@example.com',
          password: 'TestP@ss1' // 8 chars
        });
        expect(shortResult.success).toBe(false);

        // Should pass with 12-char password
        const longResult = strictSchemas.registerSchema.safeParse({
          email: 'test@example.com',
          password: 'TestP@ssword1!' // 13 chars
        });
        expect(longResult.success).toBe(true);
      });
    });

    describe('email edge cases', () => {
      it('should handle international domain names', () => {
        // Note: Standard email validation may not support IDN domains
        // This test documents the current behavior
        emailEdgeCases.internationalDomains.forEach(email => {
          const result = authSchemas.registerSchema.safeParse({
            email,
            password: 'ValidPass123!'
          });

          // Most email validators don't support IDN without special handling
          expect(result.success).toBe(false);
        });
      });

      it('should handle borderline valid emails', () => {
        emailEdgeCases.borderlineValid.forEach(email => {
          const result = authSchemas.registerSchema.safeParse({
            email,
            password: 'ValidPass123!'
          });

          expect(result.success).toBe(true);
        });
      });

      it('should reject borderline invalid emails', () => {
        emailEdgeCases.borderlineInvalid.forEach(email => {
          const result = authSchemas.registerSchema.safeParse({
            email,
            password: 'ValidPass123!'
          });

          expect(result.success).toBe(false);
        });
      });
    });
  });

  describe('loginSchema', () => {
    it('should accept valid login credentials', () => {
      const result = authSchemas.loginSchema.safeParse({
        email: 'test@example.com',
        password: 'any-password'
      });

      expect(result.success).toBe(true);
    });

    it('should accept any password for login (no complexity check)', () => {
      const result = authSchemas.loginSchema.safeParse({
        email: 'test@example.com',
        password: 'weak'
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid emails', () => {
      const result = authSchemas.loginSchema.safeParse({
        email: 'invalid-email',
        password: 'password'
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const testCases = [
        {},
        { email: 'test@example.com' },
        { password: 'password' }
      ];

      testCases.forEach(testCase => {
        const result = authSchemas.loginSchema.safeParse(testCase);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('login2FASchema', () => {
    it('should accept valid 2FA login data', () => {
      valid2FATokens.forEach(otp => {
        const result = authSchemas.login2FASchema.safeParse({
          otp,
          tempToken: 'valid-temp-token'
        });

        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid 2FA tokens', () => {
      invalid2FATokens.forEach(otp => {
        const result = authSchemas.login2FASchema.safeParse({
          otp,
          tempToken: 'valid-temp-token'
        });

        expect(result.success).toBe(false);
      });
    });

    it('should require temp token', () => {
      const result = authSchemas.login2FASchema.safeParse({
        otp: '123456'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // When a field is missing completely, Zod generates a generic error message
        // Check that there's an error for the tempToken field
        expect(result.error.issues.some(issue =>
          issue.path.includes('tempToken')
        )).toBe(true);
      }
    });

    it('should reject empty temp token', () => {
      const result = authSchemas.login2FASchema.safeParse({
        otp: '123456',
        tempToken: ''
      });

      expect(result.success).toBe(false);
    });
  });

  describe('refreshSchema', () => {
    it('should accept valid refresh tokens', () => {
      validRefreshTokens.forEach(refreshToken => {
        const result = authSchemas.refreshSchema.safeParse({
          refreshToken
        });

        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid refresh tokens', () => {
      invalidRefreshTokens.forEach(refreshToken => {
        const result = authSchemas.refreshSchema.safeParse({
          refreshToken
        });

        expect(result.success).toBe(false);
      });
    });

    it('should require refresh token', () => {
      const result = authSchemas.refreshSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('refreshToken')
        )).toBe(true);
      }
    });
  });

  describe('confirm2FASchema', () => {
    it('should accept valid 2FA tokens', () => {
      valid2FATokens.forEach(otp => {
        const result = authSchemas.confirm2FASchema.safeParse({ otp });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid 2FA tokens', () => {
      invalid2FATokens.forEach(otp => {
        const result = authSchemas.confirm2FASchema.safeParse({ otp });
        expect(result.success).toBe(false);
      });
    });

    it('should provide specific error message for OTP', () => {
      const result = authSchemas.confirm2FASchema.safeParse({ otp: '123' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.message.includes('OTP must be exactly 6 digits')
        )).toBe(true);
      }
    });
  });

  describe('reset2FASchema', () => {
    it('should accept valid password', () => {
      const result = authSchemas.reset2FASchema.safeParse({
        password: 'any-password'
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty password', () => {
      const result = authSchemas.reset2FASchema.safeParse({
        password: ''
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.message.includes('Password is required')
        )).toBe(true);
      }
    });

    it('should require password field', () => {
      const result = authSchemas.reset2FASchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('disable2FASchema', () => {
    it('should accept valid password', () => {
      const result = authSchemas.disable2FASchema.safeParse({
        password: 'any-password'
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty password', () => {
      const result = authSchemas.disable2FASchema.safeParse({
        password: ''
      });

      expect(result.success).toBe(false);
    });
  });

  describe('generate2FASchema', () => {
    it('should accept valid password', () => {
      const result = authSchemas.generate2FASchema.safeParse({
        password: 'any-password'
      });

      expect(result.success).toBe(true);
    });

    it('should provide specific error message', () => {
      const result = authSchemas.generate2FASchema.safeParse({
        password: ''
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.message.includes('Password is required for 2FA management')
        )).toBe(true);
      }
    });
  });

  describe('deleteAccountSchema', () => {
    it('should accept valid password', () => {
      const result = authSchemas.deleteAccountSchema.safeParse({
        password: 'any-password'
      });

      expect(result.success).toBe(true);
    });

    it('should provide specific error message', () => {
      const result = authSchemas.deleteAccountSchema.safeParse({
        password: ''
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.message.includes('Password is required to delete account')
        )).toBe(true);
      }
    });
  });

  describe('passkey schemas', () => {
    describe('passkeyRegistrationStartSchema', () => {
      it('should accept password with optional name', () => {
        const result = authSchemas.passkeyRegistrationStartSchema.safeParse({
          password: 'valid-password',
          name: 'My Passkey'
        });

        expect(result.success).toBe(true);
      });

      it('should accept password without name', () => {
        const result = authSchemas.passkeyRegistrationStartSchema.safeParse({
          password: 'valid-password'
        });

        expect(result.success).toBe(true);
      });

      it('should require password', () => {
        const result = authSchemas.passkeyRegistrationStartSchema.safeParse({
          name: 'My Passkey'
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some(issue =>
            issue.path.includes('password')
          )).toBe(true);
        }
      });
    });

    describe('passkeyRegistrationCompleteSchema', () => {
      it('should accept valid WebAuthn credential', () => {
        const validCredential = {
          credential: {
            id: 'validBase64UrlId_123',
            rawId: 'validBase64UrlRawId_456',
            response: {
              attestationObject: 'validAttestationObject_789',
              clientDataJSON: 'validClientDataJSON_012',
              transports: ['usb', 'nfc']
            },
            type: 'public-key' as const,
            clientExtensionResults: {},
            authenticatorAttachment: 'cross-platform' as const
          },
          name: 'My Passkey'
        };

        const result = authSchemas.passkeyRegistrationCompleteSchema.safeParse(validCredential);
        expect(result.success).toBe(true);
      });

      it('should reject invalid base64url encoding', () => {
        const invalidCredential = {
          credential: {
            id: 'invalid+base64/with=padding', // Contains invalid chars for base64url
            rawId: 'validBase64UrlRawId_456',
            response: {
              attestationObject: 'validAttestationObject_789',
              clientDataJSON: 'validClientDataJSON_012'
            },
            type: 'public-key' as const
          }
        };

        const result = authSchemas.passkeyRegistrationCompleteSchema.safeParse(invalidCredential);
        expect(result.success).toBe(false);
      });

      it('should accept valid transport values', () => {
        const validTransports = ['usb', 'nfc', 'ble', 'internal', 'hybrid', 'cable'];

        validTransports.forEach(transport => {
          const credential = {
            credential: {
              id: 'validId',
              rawId: 'validRawId',
              response: {
                attestationObject: 'validAttestation',
                clientDataJSON: 'validClientData',
                transports: [transport]
              },
              type: 'public-key' as const
            }
          };

          const result = authSchemas.passkeyRegistrationCompleteSchema.safeParse(credential);
          expect(result.success).toBe(true);
        });
      });

      it('should require type to be public-key', () => {
        const invalidCredential = {
          credential: {
            id: 'validId',
            rawId: 'validRawId',
            response: {
              attestationObject: 'validAttestation',
              clientDataJSON: 'validClientData'
            },
            type: 'invalid-type'
          }
        };

        const result = authSchemas.passkeyRegistrationCompleteSchema.safeParse(invalidCredential);
        expect(result.success).toBe(false);
      });
    });

    describe('passkeyAuthenticationStartSchema', () => {
      it('should accept valid email', () => {
        const result = authSchemas.passkeyAuthenticationStartSchema.safeParse({
          email: 'test@example.com'
        });

        expect(result.success).toBe(true);
      });

      it('should accept empty object (email is optional)', () => {
        const result = authSchemas.passkeyAuthenticationStartSchema.safeParse({});

        expect(result.success).toBe(true);
      });

      it('should reject invalid email', () => {
        const result = authSchemas.passkeyAuthenticationStartSchema.safeParse({
          email: 'invalid-email'
        });

        expect(result.success).toBe(false);
      });
    });

    describe('passkeyAuthenticationCompleteSchema', () => {
      it('should accept valid authentication credential', () => {
        const validCredential = {
          credential: {
            id: 'valid-credential-id',
            rawId: 'valid-raw-id',
            response: {
              authenticatorData: 'valid-authenticator-data',
              clientDataJSON: 'valid-client-data',
              signature: 'valid-signature',
              userHandle: 'valid-user-handle'
            },
            type: 'public-key' as const,
            clientExtensionResults: {},
            authenticatorAttachment: 'platform' as const
          }
        };

        const result = authSchemas.passkeyAuthenticationCompleteSchema.safeParse(validCredential);
        expect(result.success).toBe(true);
      });

      it('should accept null userHandle', () => {
        const credential = {
          credential: {
            id: 'valid-id',
            rawId: 'valid-raw-id',
            response: {
              authenticatorData: 'valid-data',
              clientDataJSON: 'valid-client-data',
              signature: 'valid-signature',
              userHandle: null
            },
            type: 'public-key' as const
          }
        };

        const result = authSchemas.passkeyAuthenticationCompleteSchema.safeParse(credential);
        expect(result.success).toBe(true);
      });
    });

    describe('passkeyDeleteSchema', () => {
      it('should accept valid passkey deletion data', () => {
        const result = authSchemas.passkeyDeleteSchema.safeParse({
          passkeyId: 'valid-passkey-id',
          password: 'valid-password'
        });

        expect(result.success).toBe(true);
      });

      it('should require both passkeyId and password', () => {
        const testCases = [
          {},
          { passkeyId: 'valid-id' },
          { password: 'valid-password' }
        ];

        testCases.forEach(testCase => {
          const result = authSchemas.passkeyDeleteSchema.safeParse(testCase);
          expect(result.success).toBe(false);
        });
      });

      it('should provide specific error messages', () => {
        const result = authSchemas.passkeyDeleteSchema.safeParse({
          passkeyId: '',
          password: ''
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map(issue => issue.message);
          expect(messages.some(msg => msg.includes('Passkey ID is required'))).toBe(true);
          expect(messages.some(msg => msg.includes('Password is required to delete passkey'))).toBe(true);
        }
      });
    });

    describe('passkeyRenameSchema', () => {
      it('should accept valid rename data', () => {
        const result = authSchemas.passkeyRenameSchema.safeParse({
          passkeyId: 'valid-passkey-id',
          name: 'New Passkey Name'
        });

        expect(result.success).toBe(true);
      });

      it('should enforce name length limits', () => {
        const longName = 'A'.repeat(51); // 51 characters
        const result = authSchemas.passkeyRenameSchema.safeParse({
          passkeyId: 'valid-passkey-id',
          name: longName
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some(issue =>
            issue.message.includes('50 characters or less')
          )).toBe(true);
        }
      });

      it('should require non-empty name', () => {
        const result = authSchemas.passkeyRenameSchema.safeParse({
          passkeyId: 'valid-passkey-id',
          name: ''
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some(issue =>
            issue.message.includes('Passkey name is required')
          )).toBe(true);
        }
      });
    });
  });
});

describe('default exported schemas', () => {
  // Test the backward compatibility exports
  it('should have all default schemas available', () => {
    expect(registerSchema).toBeDefined();
    expect(loginSchema).toBeDefined();
    expect(login2FASchema).toBeDefined();
    expect(refreshSchema).toBeDefined();
    expect(confirm2FASchema).toBeDefined();
    expect(reset2FASchema).toBeDefined();
    expect(disable2FASchema).toBeDefined();
    expect(generate2FASchema).toBeDefined();
    expect(deleteAccountSchema).toBeDefined();
    expect(passkeyRegistrationStartSchema).toBeDefined();
    expect(passkeyRegistrationCompleteSchema).toBeDefined();
    expect(passkeyAuthenticationStartSchema).toBeDefined();
    expect(passkeyAuthenticationCompleteSchema).toBeDefined();
    expect(passkeyDeleteSchema).toBeDefined();
    expect(passkeyRenameSchema).toBeDefined();
  });

  it('should work with default configuration', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'TestPass123!'
    });

    expect(result.success).toBe(true);
  });

  it('should use default password requirements', () => {
    // Should reject password without special character
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'TestPassword123'
    });

    expect(result.success).toBe(false);
  });
});

describe('schema error messages', () => {
  it('should provide clear error messages for validation failures', () => {
    const result = registerSchema.safeParse({
      email: 'invalid-email',
      password: 'weak'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(issue => issue.message);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some(msg => msg.includes('email') || msg.includes('Invalid email'))).toBe(true);
    }
  });

  it('should provide specific error messages for 2FA tokens', () => {
    const result = login2FASchema.safeParse({
      otp: '123',
      tempToken: 'valid-token'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue =>
        issue.message === 'OTP must be exactly 6 digits.'
      )).toBe(true);
    }
  });

  it('should provide specific error messages for passkey fields', () => {
    const result = passkeyRenameSchema.safeParse({
      passkeyId: '',
      name: ''
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(issue => issue.message);
      expect(messages).toContain('Passkey ID is required.');
      expect(messages).toContain('Passkey name is required.');
    }
  });
});