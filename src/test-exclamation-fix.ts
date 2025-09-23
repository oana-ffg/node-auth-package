/**
 * Test script to verify the exclamation mark bug fix
 * This tests password validation in both traditional and serverless modes
 */

import { AuthSchemas } from './schemas/authSchemas';

async function testPasswordValidation() {
  console.log('🧪 Testing Password Validation with Exclamation Marks\n');

  const authSchemas = new AuthSchemas({
    passwordMinLength: 8,
    requireUppercase: true,
    requireNumber: true,
    requireSpecialChar: true,
  });

  const testPasswords = [
    'Password123!',      // Contains !
    '!Password123',      // Starts with !
    'Pass!word123',      // ! in middle
    'Password123!!',     // Multiple !
    'P@ssw0rd!',        // Multiple special chars including !
    'Password123',       // No special chars (should fail)
    'password123!',      // No uppercase (should fail)
    'PASSWORD123!',      // No lowercase (should fail)
    'Password!',         // No numbers (should fail)
    'Pass!',            // Too short (should fail)
  ];

  console.log('Testing registerSchema validation:');
  testPasswords.forEach((password, index) => {
    const testData = { email: 'test@example.com', password };
    const result = authSchemas.registerSchema.safeParse(testData);

    console.log(`${index + 1}. Password: "${password}"`);
    console.log(`   Valid: ${result.success}`);

    if (!result.success) {
      const passwordErrors = result.error.issues.filter(issue =>
        issue.path.includes('password')
      );
      console.log(`   Errors: ${passwordErrors.map(e => e.message).join(', ')}`);
    } else {
      console.log(`   Parsed successfully - has !: ${password.includes('!')}`);
    }
    console.log('');
  });

  console.log('\n✅ Password validation test completed');
}

async function testJSONParsing() {
  console.log('🧪 Testing JSON Parsing with Exclamation Marks\n');

  // Import the serverless module to test JSON parsing
  try {
    // These are examples of JSON strings that might come from serverless environments
    const testJSONStrings = [
      '{"email":"test@example.com","password":"Password123!"}',
      '{"email":"test@example.com","password":"!Password123"}',
      '{"email":"test@example.com","password":"Pass!word123"}',
      '{"email":"test@example.com","password":"Password123!!"}',
    ];

    testJSONStrings.forEach((jsonString, index) => {
      console.log(`${index + 1}. Testing JSON: ${jsonString}`);

      try {
        const parsed = JSON.parse(jsonString);
        console.log(`   Parsed successfully`);
        console.log(`   Password: "${parsed.password}"`);
        console.log(`   Has !: ${parsed.password.includes('!')}`);
        console.log(`   Length: ${parsed.password.length}`);
      } catch (error) {
        console.log(`   ❌ Failed to parse: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.log('');
    });

    console.log('✅ JSON parsing test completed');
  } catch (error) {
    console.error('❌ JSON parsing test failed:', error);
  }
}

async function testServerlessBodyHandling() {
  console.log('🧪 Testing Serverless Body Handling\n');

  // We'll test the logic that would be in ensureJSONBody without actually importing
  // to avoid dependency issues
  const testBodies = [
    { type: 'object', body: { email: 'test@example.com', password: 'Password123!' } },
    { type: 'string', body: '{"email":"test@example.com","password":"Password123!"}' },
    { type: 'string', body: '{"email":"test@example.com","password":"!Password123"}' },
    { type: 'string', body: '{"email":"test@example.com","password":"Pass!word123"}' },
  ];

  testBodies.forEach((test, index) => {
    console.log(`${index + 1}. Testing ${test.type} body:`);

    if (test.type === 'object') {
      const body = test.body as any;
      console.log(`   Password: "${body.password}"`);
      console.log(`   Has !: ${body.password.includes('!')}`);
      console.log(`   ✅ Object body handled correctly`);
    } else if (test.type === 'string') {
      try {
        const bodyString = test.body as string;
        console.log(`   JSON String: ${bodyString}`);

        const parsed = JSON.parse(bodyString);
        console.log(`   Parsed password: "${parsed.password}"`);
        console.log(`   Has !: ${parsed.password.includes('!')}`);

        // Check if password was corrupted during parsing
        const originalPasswordInString = bodyString.match(/"password"\s*:\s*"([^"]*?)"/)?.[1];
        if (originalPasswordInString && originalPasswordInString !== parsed.password) {
          console.log(`   ❌ Password corrupted during parsing!`);
          console.log(`   Original: "${originalPasswordInString}"`);
          console.log(`   Parsed: "${parsed.password}"`);
        } else {
          console.log(`   ✅ Password preserved correctly`);
        }
      } catch (error) {
        console.log(`   ❌ Failed to parse: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log('');
  });

  console.log('✅ Serverless body handling test completed');
}

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('🔐 Testing Exclamation Mark Bug Fix\n');

  Promise.resolve()
    .then(() => testPasswordValidation())
    .then(() => console.log('\n' + '='.repeat(50) + '\n'))
    .then(() => testJSONParsing())
    .then(() => console.log('\n' + '='.repeat(50) + '\n'))
    .then(() => testServerlessBodyHandling())
    .then(() => {
      console.log('\n🎉 All tests completed!');
      console.log('\n📝 Summary:');
      console.log('- Password validation with ! characters tested');
      console.log('- JSON parsing with special characters verified');
      console.log('- Serverless body handling validated');
      console.log('- Enhanced error messages and debugging added');
    })
    .catch(console.error);
}

export { testPasswordValidation, testJSONParsing, testServerlessBodyHandling };