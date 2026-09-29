import "dotenv/config";
import { z } from "zod";

const smtpSenderSchema = z.array(
  z.object({
    id: z.string(),
    user: z.string().email(),
    pass: z.string(),
    host: z.string(),
    port: z.number(),
  })
);

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MIN_DELAY_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(50),
  SMTP_SENDERS: z.string().transform((val) => {
    const parsed = JSON.parse(val);
    return smtpSenderSchema.parse(parsed);
  }),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_CALLBACK_URL: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("7d"),
  SESSION_SECRET: z.string(),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  ELASTICSEARCH_URL: z.string().default("http://localhost:9200"),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment variables:");
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = result.data;

export type SmtpSender = (typeof config.SMTP_SENDERS)[number];
