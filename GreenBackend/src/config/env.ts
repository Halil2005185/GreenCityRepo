import 'dotenv/config'

import { z } from 'zod'

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')

const databaseUrl = z.string().min(1).refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === 'postgres:' || protocol === 'postgresql:'
    } catch {
      return false
    }
  },
  { message: 'Must be a valid PostgreSQL connection URL' },
)

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  API_PREFIX: z.string().regex(/^\/[a-z0-9/_-]*$/i).default('/api'),
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: booleanString.default(false),
  DATABASE_SSL_REJECT_UNAUTHORIZED: booleanString.default(true),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  DATABASE_REQUIRED_ON_START: booleanString.default(true),

  // ───────────────────────────── المصادقة ─────────────────────────────
  //
  // رمز الوصول JWT قصير العمر يُحمل في الذاكرة. أما رمز التحديث فليس JWT
  // بل قيمة عشوائية معتمة تُخزَّن مُجزّأة في `sessions` — لذلك سرّ واحد يكفي.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'Must be at least 32 characters. Generate with: openssl rand -base64 32'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().max(120).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),

  AUTH_COOKIE_NAME: z.string().min(1).default('gc_refresh'),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  // خلف Nginx على أصل واحد يكون الاتصال HTTPS دائمًا؛ محليًا فقط يُطفأ.
  AUTH_COOKIE_SECURE: booleanString.default(true),

  AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().positive().max(50).default(5),
  AUTH_LOCK_MINUTES: z.coerce.number().int().positive().max(1440).default(15),

  INVITATION_TTL_HOURS: z.coerce.number().int().positive().max(720).default(168),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(60),

  /** يُستخدم لبناء روابط الدعوة واستعادة كلمة المرور في البريد. */
  ADMIN_APP_URL: z.string().url().default('http://localhost:3001'),

  // ───────────────────────────── البريد ─────────────────────────────
  //
  // الرسائل تُدرج في صندوق صادر داخل المعاملة نفسها، ويرسلها عامل مستقل.
  // إطفاء `MAIL_ENABLED` يبقي الإدراج ويوقف الإرسال، فيعمل النظام كاملًا
  // على جهاز التطوير دون بريد حقيقي.
  MAIL_ENABLED: booleanString.default(false),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Green Cities <no-reply@localhost>'),
  MAIL_REPLY_TO: z.string().optional(),

  OUTBOX_POLL_MS: z.coerce.number().int().min(500).max(600_000).default(5000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))

  throw new Error(`Invalid environment variables: ${JSON.stringify(issues)}`)
}

export const env = parsed.data
export type Environment = typeof env
