/**
 * Test suite to verify the exclamation mark bug fix
 * Tests password validation and JSON parsing with special characters
 */

import { AuthSchemas } from '../src/schemas/authSchemas';

describe('Exclamation Mark Bug Fix', () => {
  let authSchemas: AuthSchemas;

  beforeEach(() => {
    authSchemas = new AuthSchemas({
      passwordMinLength: 8,
      requireUppercase: true,
      requireNumber: true,
      requireSpecialChar: true,
    });
  });

  describe('Password Validation with Exclamation Marks', () => {
    test('should accept passwords with exclamation marks', () => {
      const validPasswords = [
        'Password123!',      // Contains !
        '!Password123',      // Starts with !
        'Pass!word123',      // ! in middle
        'Password123!!',     // Multiple !
        'P@ssw0rd!',        // Multiple special chars including !
      ];

      validPasswords.forEach(password => {
        const testData = { email: 'test@example.com', password };
        const result = authSchemas.registerSchema.safeParse(testData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.password).toBe(password);
          expect(result.data.password.includes('!')).toBe(true);
        }
      });
    });

    test('should reject passwords without special characters', () => {
      const invalidPasswords = [
        'Password123',       // No special chars
        'password123',       // No uppercase
        'PASSWORD123',       // No lowercase
        'Password',          // No numbers
        'Pass!',            // Too short
      ];

      invalidPasswords.forEach(password => {
        const testData = { email: 'test@example.com', password };
        const result = authSchemas.registerSchema.safeParse(testData);

        expect(result.success).toBe(false);
      });
    });

    test('should preserve special characters during validation', () => {
      const password = 'MyP@ssw0rd!#$';
      const testData = { email: 'test@example.com', password };
      const result = authSchemas.registerSchema.safeParse(testData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.password).toBe(password);
        expect(result.data.password.length).toBe(password.length);

        // Check that specific special characters are preserved
        expect(result.data.password.includes('!')).toBe(true);
        expect(result.data.password.includes('@')).toBe(true);
        expect(result.data.password.includes('#')).toBe(true);
        expect(result.data.password.includes('$')).toBe(true);
      }
    });
  });

  describe('JSON Parsing with Special Characters', () => {
    test('should parse JSON strings with exclamation marks correctly', () => {
      const testCases = [
        { json: '{"email":"test@example.com","password":"Password123!"}', expected: 'Password123!' },
        { json: '{"email":"test@example.com","password":"!Password123"}', expected: '!Password123' },
        { json: '{"email":"test@example.com","password":"Pass!word123"}', expected: 'Pass!word123' },
        { json: '{"email":"test@example.com","password":"Password123!!"}', expected: 'Password123!!' },
        { json: '{"email":"test@example.com","password":"P@ssw0rd!#$"}', expected: 'P@ssw0rd!#$' },
      ];

      testCases.forEach(({ json, expected }) => {
        const parsed = JSON.parse(json);
        expect(parsed.password).toBe(expected);
        expect(parsed.password.includes('!')).toBe(true);
        expect(parsed.password.length).toBe(expected.length);
      });
    });

    test('should detect password corruption during JSON parsing', () => {
      const jsonString = '{"email":"test@example.com","password":"Password123!"}';
      const parsed = JSON.parse(jsonString);

      // Extract original password from JSON string
      const originalPasswordInString = jsonString.match(/"password"\s*:\s*"([^"]*?)"/)?.[1];

      expect(originalPasswordInString).toBe('Password123!');
      expect(parsed.password).toBe(originalPasswordInString);
      expect(parsed.password).toBe('Password123!');
    });

    test('should handle complex special character combinations', () => {
      const complexPasswords = [
        'P@$$w0rd!',         // Multiple $ and !
        'Test!@#$%^&*()',    // Many special chars
        'Émojis🔒And!',      // Unicode and special chars
        'Quote"And!Mark',    // Quotes and exclamation
      ];

      complexPasswords.forEach(password => {
        const jsonString = JSON.stringify({ email: 'test@example.com', password });
        const parsed = JSON.parse(jsonString);

        expect(parsed.password).toBe(password);
        expect(parsed.password.length).toBe(password.length);
      });
    });
  });

  describe('Login Schema Validation', () => {
    test('should accept any password format for login (no validation)', () => {
      const passwords = [
        'Password123!',
        'weak',
        '!@#$%^&*()',
        '',
        'very-long-password-with-special-characters-!@#$%^&*()',
      ];

      passwords.forEach(password => {
        const testData = { email: 'test@example.com', password };
        const result = authSchemas.loginSchema.safeParse(testData);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.password).toBe(password);
        }
      });
    });
  });

  describe('Special Character Regex Validation', () => {
    test('should correctly identify special characters including exclamation marks', () => {
      const specialCharRegex = /[^A-Za-z0-9]/;

      const testsWithSpecialChars = [
        '!',
        '@',
        '#',
        '$',
        '%',
        '^',
        '&',
        '*',
        '(',
        ')',
        'Password123!',
        'Test@123',
        'Hello#World',
      ];

      testsWithSpecialChars.forEach(text => {
        expect(specialCharRegex.test(text)).toBe(true);
      });

      const testsWithoutSpecialChars = [
        'Password123',
        'HelloWorld',
        'abc123',
        'ABC',
        '123',
      ];

      testsWithoutSpecialChars.forEach(text => {
        expect(specialCharRegex.test(text)).toBe(false);
      });
    });
  });
});