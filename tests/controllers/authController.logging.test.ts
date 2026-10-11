import { FirefunAuth } from '../../src/index';
import { testConfig } from '../setup';
import { createMockRequest, createMockResponse } from '../mocks/express.mock';

const controller = new FirefunAuth(testConfig).authController;

for (const method of ['registerUser', 'loginUser'] as const) {
  test.each([42, {}, [], null])(`${method} rejects a non-string password without logging it or throwing: %p`, async (password) => {
    const req = createMockRequest();
    req.body = { email: 'test@example.com', password };
    const res = createMockResponse();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    log.mockClear();
    await controller[method](req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(log).not.toHaveBeenCalled();
  });
}
