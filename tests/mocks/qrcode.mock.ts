/**
 * Mock implementation for qrcode library
 * Used for testing QR code generation functionality
 */

export interface QRCodeMockConfig {
  toDataURLResult?: string;
  toStringResult?: string;
  toFileResult?: void;
  toDataURLError?: Error;
  toStringError?: Error;
  toFileError?: Error;
}

export class QRCodeMock {
  private config: QRCodeMockConfig;
  private static instance: QRCodeMock;

  constructor(config: QRCodeMockConfig = {}) {
    this.config = {
      toDataURLResult: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      toStringResult: '██████████████  ██████  ██████████████\n██  ██  ██  ██    ██    ██  ██  ██  ██\n██  ██████  ██  ██████  ██  ██████  ██\n██████████████████████████████████████',
      toFileResult: undefined,
      ...config
    };
  }

  static getInstance(config?: QRCodeMockConfig): QRCodeMock {
    if (!QRCodeMock.instance) {
      QRCodeMock.instance = new QRCodeMock(config);
    }
    if (config) {
      QRCodeMock.instance.updateConfig(config);
    }
    return QRCodeMock.instance;
  }

  updateConfig(config: Partial<QRCodeMockConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.config = {
      toDataURLResult: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      toStringResult: '██████████████  ██████  ██████████████\n██  ██  ██  ██    ██    ██  ██  ██  ██\n██  ██████  ██  ██████  ██  ██████  ██\n██████████████████████████████████████',
      toFileResult: undefined
    };
  }

  // Mock the toDataURL function (returns base64 encoded image)
  toDataURL = jest.fn().mockImplementation((text: string, options?: any): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (this.config.toDataURLError) {
        reject(this.config.toDataURLError);
        return;
      }

      // Simulate different responses based on input
      if (text === 'INVALID_URL') {
        reject(new Error('Invalid URL format'));
        return;
      }

      if (text === 'EMPTY') {
        reject(new Error('Cannot generate QR code for empty string'));
        return;
      }

      // Simulate a realistic base64 QR code based on input length
      let result = this.config.toDataURLResult!;
      if (text.length > 100) {
        // Simulate larger QR code for longer text
        result = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR42mNkYGBgYGBgYGBgYAAABQABDQottAAAAABJRU5ErkJggg==';
      }

      resolve(result);
    });
  });

  // Mock the toString function (returns ASCII art)
  toString = jest.fn().mockImplementation((text: string, options?: any): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (this.config.toStringError) {
        reject(this.config.toStringError);
        return;
      }

      if (text === 'INVALID_URL') {
        reject(new Error('Invalid URL format'));
        return;
      }

      if (text === 'EMPTY') {
        reject(new Error('Cannot generate QR code for empty string'));
        return;
      }

      resolve(this.config.toStringResult!);
    });
  });

  // Mock the toFile function (writes to file)
  toFile = jest.fn().mockImplementation((path: string, text: string, options?: any): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (this.config.toFileError) {
        reject(this.config.toFileError);
        return;
      }

      if (text === 'INVALID_URL') {
        reject(new Error('Invalid URL format'));
        return;
      }

      if (text === 'EMPTY') {
        reject(new Error('Cannot generate QR code for empty string'));
        return;
      }

      if (path === '/invalid/path') {
        reject(new Error('Invalid file path'));
        return;
      }

      resolve(this.config.toFileResult);
    });
  });

  // Mock the create function (lower level API)
  create = jest.fn().mockImplementation((text: string, options?: any) => {
    if (text === 'INVALID_URL') {
      throw new Error('Invalid URL format');
    }

    return {
      modules: {
        size: 21,
        data: new Array(21 * 21).fill(0).map((_, i) => i % 2 === 0)
      },
      version: 1
    };
  });
}

// Create the default mock instance
const qrcodeMock = QRCodeMock.getInstance();

// Export individual functions to match qrcode's export pattern
export const toDataURL = qrcodeMock.toDataURL;
export const toString = qrcodeMock.toString;
export const toFile = qrcodeMock.toFile;
export const create = qrcodeMock.create;

// Export default
export default qrcodeMock;

// Mock the module
jest.mock('qrcode', () => ({
  __esModule: true,
  default: qrcodeMock,
  toDataURL: qrcodeMock.toDataURL,
  toString: qrcodeMock.toString,
  toFile: qrcodeMock.toFile,
  create: qrcodeMock.create,
}));

// Helper functions for test setup
export const setupQRCodeMock = (config?: QRCodeMockConfig): QRCodeMock => {
  const mock = QRCodeMock.getInstance(config);
  mock.reset();
  if (config) {
    mock.updateConfig(config);
  }
  return mock;
};

// Common test scenarios
export const qrcodeTestScenarios = {
  validGeneration: {
    toDataURLResult: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  },
  generationError: {
    toDataURLError: new Error('Failed to generate QR code')
  },
  stringGeneration: {
    toStringResult: '██████████████  ██████  ██████████████\n██  ██  ██  ██    ██    ██  ██  ██  ██\n██  ██████  ██  ██████  ██  ██████  ██\n██████████████████████████████████████'
  },
  fileGeneration: {
    toFileResult: undefined
  },
  fileError: {
    toFileError: new Error('Failed to write QR code to file')
  }
};