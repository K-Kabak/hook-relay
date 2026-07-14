import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),
  API_KEY_PEPPER: z.string().min(32),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type AppConfig = z.infer<typeof schema>;
let cached: AppConfig | undefined;

export function config(): AppConfig {
  cached ??= schema.parse(process.env);
  return cached;
}
