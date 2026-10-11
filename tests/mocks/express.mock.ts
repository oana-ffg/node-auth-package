/**
 * Express Request/Response Mocks for firefun-node-auth tests
 *
 * This module provides comprehensive mocks for Express.js request and response
 * objects to enable thorough testing of middleware and controller functions.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Mock Express Request object with all required properties and methods
 */
export interface MockRequest extends Partial<Request> {
  body?: any;
  query?: any;
  params?: any;
  headers?: { [key: string]: string | string[] | undefined };
  user?: any;
  ip?: string;
  method?: string;
  url?: string;
  originalUrl?: string;
  path?: string;
  protocol?: string;
  secure?: boolean;
  cookies?: { [key: string]: string };
  signedCookies?: { [key: string]: string };
  session?: any;
  app?: any;
  get: jest.MockedFunction<(name: string) => string | undefined>;
  header: jest.MockedFunction<(name: string) => string | undefined>;
}

/**
 * Mock Express Response object with all required properties and methods
 */
export interface MockResponse extends Partial<Response> {
  status: jest.MockedFunction<(code: number) => MockResponse>;
  json: jest.MockedFunction<(body: any) => MockResponse>;
  send: jest.MockedFunction<(body: any) => MockResponse>;
  cookie: jest.MockedFunction<(name: string, value: string, options?: any) => MockResponse>;
  clearCookie: jest.MockedFunction<(name: string, options?: any) => MockResponse>;
  redirect: jest.MockedFunction<(url: string) => MockResponse>;
  set: jest.MockedFunction<(field: string, value: string) => MockResponse>;
  setHeader: jest.MockedFunction<(name: string, value: string | string[]) => MockResponse>;
  getHeader: jest.MockedFunction<(name: string) => string | string[] | undefined>;
  on: jest.MockedFunction<(event: string, callback: (...args: any[]) => void) => MockResponse>;
  headers?: { [key: string]: string | string[] };
  statusCode?: number;
  locals?: any;
}

/**
 * Create a mock Express request object
 */
export function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  const mockRequest: MockRequest = {
    body: {},
    query: {},
    params: {},
    headers: {
      'content-type': 'application/json',
      'user-agent': 'test-agent',
      'host': 'localhost:3000',
    },
    ip: '127.0.0.1',
    method: 'GET',
    url: '/',
    originalUrl: '/',
    path: '/',
    protocol: 'http',
    secure: false,
    cookies: {},
    signedCookies: {},
    session: {},
    app: {
      get: jest.fn((key: string) => {
        if (key === 'trust proxy') return false;
        return undefined;
      }),
    },

    // Mock methods
    get: jest.fn((name: string) => {
      const headers = mockRequest.headers || {};
      return headers[name.toLowerCase()] as string | undefined;
    }),

    header: jest.fn((name: string) => {
      const headers = mockRequest.headers || {};
      return headers[name.toLowerCase()] as string | undefined;
    }),

    ...overrides,
  };

  return mockRequest;
}

/**
 * Create a mock Express response object
 */
export function createMockResponse(overrides: Partial<MockResponse> = {}): MockResponse {
  const mockResponse: MockResponse = {
    statusCode: 200,
    headers: {},
    locals: {},

    // Chainable methods
    status: jest.fn().mockImplementation((code: number) => {
      mockResponse.statusCode = code;
      return mockResponse;
    }),

    json: jest.fn().mockImplementation((body: any) => {
      return mockResponse;
    }),

    send: jest.fn().mockImplementation((body: any) => {
      return mockResponse;
    }),

    cookie: jest.fn().mockImplementation((name: string, value: string, options?: any) => {
      return mockResponse;
    }),

    clearCookie: jest.fn().mockImplementation((name: string, options?: any) => {
      return mockResponse;
    }),

    redirect: jest.fn().mockImplementation((url: string) => {
      return mockResponse;
    }),

    set: jest.fn().mockImplementation((field: string, value: string) => {
      if (!mockResponse.headers) {
        mockResponse.headers = {};
      }
      mockResponse.headers[field.toLowerCase()] = value;
      return mockResponse;
    }),

    setHeader: jest.fn().mockImplementation((name: string, value: string | string[]) => {
      if (!mockResponse.headers) {
        mockResponse.headers = {};
      }
      mockResponse.headers[name.toLowerCase()] = value;
      return mockResponse;
    }),

    getHeader: jest.fn().mockImplementation((name: string) => {
      const headers = mockResponse.headers || {};
      return headers[name.toLowerCase()];
    }),

    removeListener: jest.fn().mockReturnThis(),

    on: jest.fn().mockImplementation((event: string, callback: (...args: any[]) => void) => {
      return mockResponse;
    }),

    ...overrides,
  };

  return mockResponse;
}

/**
 * Create a mock Express next function
 */
export function createMockNext(): jest.MockedFunction<NextFunction> {
  return jest.fn();
}

/**
 * Create authenticated request mock with user data
 */
export function createAuthenticatedRequest(user: any = {}, overrides: Partial<MockRequest> = {}): MockRequest {
  const defaultUser = {
    userId: 'user_123',
    email: 'test@example.com',
    twoFactorEnabled: false,
    ...user,
  };

  return createMockRequest({
    user: defaultUser,
    headers: {
      'authorization': 'Bearer valid_jwt_token',
      'content-type': 'application/json',
    },
    ...overrides,
  });
}

/**
 * Create request mock with JWT token in Authorization header
 */
export function createRequestWithToken(token: string, overrides: Partial<MockRequest> = {}): MockRequest {
  return createMockRequest({
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    ...overrides,
  });
}

/**
 * Create request mock for registration endpoint
 */
export function createRegistrationRequest(data: any = {}, overrides: Partial<MockRequest> = {}): MockRequest {
  const defaultData = {
    email: 'test@example.com',
    password: 'TestPassword123!',
    ...data,
  };

  return createMockRequest({
    method: 'POST',
    url: '/auth/register',
    path: '/auth/register',
    body: defaultData,
    ...overrides,
  });
}

/**
 * Create request mock for login endpoint
 */
export function createLoginRequest(data: any = {}, overrides: Partial<MockRequest> = {}): MockRequest {
  const defaultData = {
    email: 'test@example.com',
    password: 'TestPassword123!',
    ...data,
  };

  return createMockRequest({
    method: 'POST',
    url: '/auth/login',
    path: '/auth/login',
    body: defaultData,
    ...overrides,
  });
}

/**
 * Create request mock for 2FA endpoints
 */
export function create2FARequest(data: any = {}, overrides: Partial<MockRequest> = {}): MockRequest {
  const defaultData = {
    token: '123456',
    ...data,
  };

  return createMockRequest({
    method: 'POST',
    url: '/auth/2fa/verify',
    path: '/auth/2fa/verify',
    body: defaultData,
    ...overrides,
  });
}

/**
 * Create request mock for passkey endpoints
 */
export function createPasskeyRequest(data: any = {}, overrides: Partial<MockRequest> = {}): MockRequest {
  return createMockRequest({
    method: 'POST',
    url: '/auth/passkey/register/start',
    path: '/auth/passkey/register/start',
    body: data,
    ...overrides,
  });
}

/**
 * Rate limiting test helpers
 */
export const RateLimitHelpers = {
  /**
   * Create multiple requests to simulate rate limiting
   */
  createMultipleRequests: (count: number, overrides: Partial<MockRequest> = {}) => {
    return Array.from({ length: count }, (_, i) =>
      createMockRequest({
        ip: '127.0.0.1',
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'user-agent': `test-agent-${i}`,
        },
        ...overrides,
      })
    );
  },

  /**
   * Create requests from different IPs
   */
  createRequestsFromDifferentIPs: (ips: string[]) => {
    return ips.map((ip, i) =>
      createMockRequest({
        ip,
        headers: {
          'x-forwarded-for': ip,
          'user-agent': `test-agent-${i}`,
        },
      })
    );
  },
};

/**
 * Error simulation helpers
 */
export const ErrorHelpers = {
  /**
   * Create request that will cause JSON parsing error
   */
  createMalformedJSONRequest: (): MockRequest => {
    const req = createMockRequest({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    });

    // Simulate malformed JSON by setting body to something that would cause parsing issues
    Object.defineProperty(req, 'body', {
      get: () => {
        throw new SyntaxError('Unexpected token in JSON');
      },
    });

    return req;
  },

  /**
   * Create request with oversized body
   */
  createOversizedRequest: (): MockRequest => {
    return createMockRequest({
      method: 'POST',
      body: {
        data: 'x'.repeat(1000000), // 1MB of data
      },
    });
  },

  /**
   * Create request with missing content-type
   */
  createRequestWithoutContentType: (): MockRequest => {
    return createMockRequest({
      method: 'POST',
      headers: {},
      body: {
        email: 'test@example.com',
        password: 'password',
      },
    });
  },
};

/**
 * Utility functions for mock management
 */
export const MockUtils = {
  /**
   * Reset all mocks in a response object
   */
  resetResponseMocks: (res: MockResponse) => {
    Object.values(res).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockClear();
      }
    });
    res.statusCode = 200;
    res.headers = {};
  },

  /**
   * Reset all mocks in a request object
   */
  resetRequestMocks: (req: MockRequest) => {
    Object.values(req).forEach(value => {
      if (jest.isMockFunction(value)) {
        value.mockClear();
      }
    });
  },

  /**
   * Extract call arguments from response mocks
   */
  getResponseCalls: (res: MockResponse) => {
    return {
      status: res.status.mock.calls,
      json: res.json.mock.calls,
      send: res.send.mock.calls,
      cookie: res.cookie.mock.calls,
      clearCookie: res.clearCookie.mock.calls,
      redirect: res.redirect.mock.calls,
    };
  },

  /**
   * Verify that response was called with expected values
   */
  expectResponseCalled: (res: MockResponse, expected: {
    status?: number;
    json?: any;
    send?: any;
    cookie?: [string, string];
    clearCookie?: string;
    redirect?: string;
  }) => {
    if (expected.status) {
      expect(res.status).toHaveBeenCalledWith(expected.status);
    }

    if (expected.json) {
      expect(res.json).toHaveBeenCalledWith(expected.json);
    }

    if (expected.send) {
      expect(res.send).toHaveBeenCalledWith(expected.send);
    }

    if (expected.cookie) {
      expect(res.cookie).toHaveBeenCalledWith(expected.cookie[0], expected.cookie[1], expect.any(Object));
    }

    if (expected.clearCookie) {
      expect(res.clearCookie).toHaveBeenCalledWith(expected.clearCookie, expect.any(Object));
    }

    if (expected.redirect) {
      expect(res.redirect).toHaveBeenCalledWith(expected.redirect);
    }
  },
};

/**
 * Testing workflow helpers
 */
export const WorkflowHelpers = {
  /**
   * Simulate complete middleware chain execution
   */
  simulateMiddlewareChain: async (
    middlewares: Array<(req: MockRequest, res: MockResponse, next: NextFunction) => void>,
    req: MockRequest,
    res: MockResponse
  ) => {
    let currentIndex = 0;

    const next: NextFunction = (error?: any) => {
      if (error) {
        throw error;
      }

      currentIndex++;
      if (currentIndex < middlewares.length) {
        middlewares[currentIndex](req, res, next);
      }
    };

    if (middlewares.length > 0) {
      middlewares[0](req, res, next);
    }
  },

  /**
   * Create a complete request-response cycle for testing
   */
  createTestCycle: () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    return { req, res, next };
  },
};