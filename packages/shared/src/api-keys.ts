import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateApiKey(): { key: string; prefix: string } {
  const key = `hr_${randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, 11) };
}

export function hashApiKey(key: string, pepper: string): string {
  return createHmac('sha256', pepper).update(key).digest('hex');
}

export function verifyApiKey(key: string, hash: string, pepper: string): boolean {
  const actual = Buffer.from(hashApiKey(key, pepper));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

