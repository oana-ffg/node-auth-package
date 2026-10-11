import jwt from 'jsonwebtoken';
import { AuthMiddleware, AuthenticatedRequest } from '../../src/middleware/authMiddleware';
import { createMockRequest, createMockResponse, createMockNext } from '../mocks/express.mock';

const secret = 'test-jwt-secret-for-regression-tests';
const middleware = new AuthMiddleware({ jwtSecret: secret });

function authenticate(payload: object | string) {
  const req = createMockRequest() as AuthenticatedRequest;
  req.headers = { authorization: `Bearer ${jwt.sign(payload, secret)}` };
  const res = createMockResponse();
  const next = createMockNext();
  middleware.verifyToken(req, res, next);
  return { req, res, next };
}

test('accepts a real signed access token', () => {
  const { req, next } = authenticate({ userId: 'test-user' });
  expect(next).toHaveBeenCalledTimes(1);
  expect(req.userId).toBe('test-user');
});

test.each([
  { userId: 'test-user', temp: true, purpose: '2fa_verification' },
  { userId: 'test-user', temp: true },
  { userId: 'test-user', purpose: '2fa_verification' },
  { email: 'test@example.com' },
  { userId: null },
  { userId: '' },
  { userId: '   ' },
  { userId: 42 },
  'signed string',
])('rejects a signed non-access payload %p', (payload) => {
  const { req, res, next } = authenticate(payload);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
  expect(req.userId).toBeUndefined();
});
