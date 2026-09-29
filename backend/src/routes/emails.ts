import { Router, Request, Response } from "express";
import { z } from "zod";
import { config } from "../config";
import prisma from "../lib/prisma";
import { emailQueue } from "../lib/queue";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import es from "../lib/elasticsearch";

const router = Router();

router.use(requireAuth);

const scheduleSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  leads: z.array(z.string().email()).min(1),
  startTime: z.string().datetime(),
  delayBetweenMs: z.number().int().min(0),
  hourlyLimit: z.number().int().min(1),
});

// Round-robin sender index stored per process (resets on restart, which is fine;
// the senderId is persisted in DB and the worker reads it from there)
let senderIndex = 0;
function nextSender() {
  const sender = config.SMTP_SENDERS[senderIndex % config.SMTP_SENDERS.length];
  senderIndex++;
  return sender;
}

router.post("/schedule", async (req: Request, res: Response) => {
  const body = scheduleSchema.parse(req.body);
  const start = new Date(body.startTime).getTime();

  const emails = await prisma.$transaction(async (tx) => {
    const rows = await Promise.all(
      body.leads.map((recipient, i) => {
        const sender = nextSender();
        const scheduledAt = new Date(start + i * body.delayBetweenMs);
        return tx.email.create({
          data: {
            userId: req.currentUser!.userId,
            recipient,
            subject: body.subject,
            body: body.body,
            senderId: sender.id,
            scheduledAt,
          },
        });
      })
    );
    return rows;
  });

  await Promise.all(
    emails.map((email) => {
      const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());
      return emailQueue.add(
        "send",
        { emailId: email.id },
        {
          jobId: email.id, // same as DB id ensures no duplicate jobs survive a re-add
          delay,
        }
      );
    })
  );

  // Index in Elasticsearch - best-effort, never fail the request
  Promise.all(
    emails.map((email) =>
      es.index({
        index: "emails",
        id: email.id,
        document: {
          id: email.id,
          userId: email.userId,
          recipient: email.recipient,
          subject: email.subject,
          status: email.status,
          scheduledAt: email.scheduledAt,
          createdAt: email.createdAt,
        },
      })
    )
  ).catch((err) => console.error("es index error:", err.message));

  res.status(201).json({ scheduled: emails.length });
});

router.get("/", async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));

  const where = {
    userId: req.currentUser!.userId,
    ...(status ? { status: status as "scheduled" | "sent" | "failed" | "sending" } : {}),
  };

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        recipient: true,
        subject: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        errorMsg: true,
        senderId: true,
      },
    }),
    prisma.email.count({ where }),
  ]);

  res.json({ emails, total, page, limit });
});

router.get("/search", async (req: Request, res: Response) => {
  const q = req.query.q as string;
  if (!q) throw new AppError(400, "query param 'q' is required");

  const result = await es.search({
    index: "emails",
    query: {
      bool: {
        must: { multi_match: { query: q, fields: ["subject", "recipient"] } },
        filter: { term: { userId: req.currentUser!.userId } },
      },
    },
  });

  const hits = result.hits.hits.map((h) => h._source);
  res.json({ results: hits });
});

export default router;
