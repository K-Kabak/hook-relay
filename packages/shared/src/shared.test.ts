import { describe, expect, it } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  isRetryableStatus,
  retryDelay,
  signWebhook,
  truncateResponseBody,
  verifyApiKey,
  verifyWebhookSignature,
} from './index.js';

describe('webhook signatures', () => {
  it('generates and verifies an HMAC while rejecting tampering', () => {
    const signature = signWebhook('evt_1', '123', '{"ok":true}', 'secret');
    expect(
      verifyWebhookSignature(
        'evt_1',
        '123',
        '{"ok":true}',
        'secret',
        signature,
      ),
    ).toBe(true);
    expect(
      verifyWebhookSignature(
        'evt_1',
        '123',
        '{"ok":false}',
        'secret',
        signature,
      ),
    ).toBe(false);
  });
});

describe('delivery helpers', () => {
  it('uses the documented retry schedule', () => {
    expect([retryDelay(1), retryDelay(2), retryDelay(3)]).toEqual([
      30_000, 120_000, 600_000,
    ]);
  });

  it('classifies retryable status codes', () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(422)).toBe(false);
    expect(isRetryableStatus(204)).toBe(false);
  });

  it('truncates response bodies', () => {
    expect(truncateResponseBody('x'.repeat(5000))).toHaveLength(4096);
  });
});

describe('API keys', () => {
  it('generates prefixed keys and verifies only the correct value', () => {
    const { key, prefix } = generateApiKey();
    const hash = hashApiKey(key, 'pepper');
    expect(key.startsWith('hr_')).toBe(true);
    expect(key.startsWith(prefix)).toBe(true);
    expect(verifyApiKey(key, hash, 'pepper')).toBe(true);
    expect(verifyApiKey(`${key}x`, hash, 'pepper')).toBe(false);
  });
});
