import "./config"; // validate env first
import { Worker, Job, DelayedError } from "bullmq";
import prisma from "./lib/prisma";
import redis from "./lib/redis";
import { emailQueue } from "./lib/queue";
import { config } from "./config";
import { sendEmail } from "./lib/mailer";
import {
  checkAndIncrRateLimit,
  msUntilNextHourWindow,
  acquireMinDelayLock,
  minDelayLockTtlMs,
} from "./lib/rateLimiter";
import { notifySlackRateLimit } from "./lib/slack";
import es from "./lib/elasticsearch";

type JobData = { emailId: string };

async function processJob(job: Job<JobData>) {
  const { emailId } = job.data;

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) {
    console.log("email row not found, skipping:", emailId);
    return;
  }

  const sender = config.SMTP_SENDERS.find((s) => s.id === email.senderId);
  if (!sender) throw new Error(`sender config missing for id: ${email.senderId}`);

  // Idempotency: claim the row by atomically moving it from 'scheduled' to 'sending'.
  // If 0 rows affected, another worker already grabbed it.
  const claimed = await prisma.$executeRaw`
    UPDATE emails SET status = 'sending', updatedAt = NOW()
    WHERE id = ${emailId} AND status = 'scheduled'
  `;
  if (claimed === 0) {
    console.log("email already claimed or sent, skipping:", emailId);
    return;
  }

  // Minimum inter-send delay per sender enforced via Redis SET NX PX.
  // If the lock is held, we push the job back by the remaining TTL so nothing is dropped.
  const lockAcquired = await acquireMinDelayLock(email.senderId);
  if (!lockAcquired) {
    const remaining = await minDelayLockTtlMs(email.senderId);
    await prisma.$executeRaw`
      UPDATE emails SET status = 'scheduled', updatedAt = NOW()
      WHERE id = ${emailId}
    `;
    await job.moveToDelayed(Date.now() + remaining, job.token);
    throw new DelayedError();
  }

  // Hourly rate limit per sender via atomic Lua script.
  // If over the limit, push into next hour window and Slack-notify once.
  const underLimit = await checkAndIncrRateLimit(email.senderId);
  if (!underLimit) {
    await prisma.$executeRaw`
      UPDATE emails SET status = 'scheduled', updatedAt = NOW()
      WHERE id = ${emailId}
    `;
    const delay = msUntilNextHourWindow(1000);
    await job.moveToDelayed(Date.now() + delay, job.token);
    notifySlackRateLimit(email.senderId, email.userId).catch((err) =>
      console.error("slack notify error:", err.message)
    );
    throw new DelayedError();
  }

  try {
    await sendEmail(sender, email.recipient, email.subject, email.body);

    await prisma.email.update({
      where: { id: emailId },
      data: { status: "sent", sentAt: new Date() },
    });

    es.update({
      index: "emails",
      id: emailId,
      doc: { status: "sent", sentAt: new Date() },
    }).catch((err) => console.error("es update error:", err.message));

    console.log("sent:", emailId, "->", email.recipient);
  } catch (err) {
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "failed", errorMsg: (err as Error).message },
    });

    es.update({
      index: "emails",
      id: emailId,
      doc: { status: "failed" },
    }).catch((e) => console.error("es update error:", e.message));

    throw err;
  }
}

const worker = new Worker<JobData>("emails", processJob, {
  connection: redis,
  concurrency: config.WORKER_CONCURRENCY,
});

worker.on("completed", (job) => console.log("job completed:", job.id));
worker.on("failed", (job, err) => {
  if (err instanceof DelayedError) return;
  console.error("job failed:", job?.id, err.message);
});

console.log("worker started, concurrency:", config.WORKER_CONCURRENCY);

import { reconcile } from "./reconcile";
reconcile().catch((err) => console.error("reconcile error:", err.message));
