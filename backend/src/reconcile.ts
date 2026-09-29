import prisma from "./lib/prisma";
import { emailQueue } from "./lib/queue";

// On server boot, find DB rows that should be in the queue but aren't.
// This covers two cases:
//   1. The server was down when a job was supposed to run (status='scheduled', no BullMQ job).
//   2. A job died mid-flight: status='sending' for longer than a reasonable timeout.
const STUCK_SENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function reconcile() {
  const stuckBefore = new Date(Date.now() - STUCK_SENDING_TIMEOUT_MS);

  const orphaned = await prisma.email.findMany({
    where: {
      OR: [
        { status: "scheduled" },
        { status: "sending", updatedAt: { lt: stuckBefore } },
      ],
    },
  });

  if (orphaned.length === 0) {
    console.log("reconcile: nothing to re-enqueue");
    return;
  }

  console.log(`reconcile: re-enqueueing ${orphaned.length} emails`);

  // Reset any stuck 'sending' rows back to 'scheduled' so the worker can re-claim them
  const stuckIds = orphaned
    .filter((e) => e.status === "sending")
    .map((e) => e.id);

  if (stuckIds.length > 0) {
    await prisma.email.updateMany({
      where: { id: { in: stuckIds } },
      data: { status: "scheduled" },
    });
  }

  await Promise.all(
    orphaned.map((email) => {
      const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());
      // Using the same jobId means BullMQ will reject the add if the job
      // already exists in the queue, which is exactly what we want.
      return emailQueue
        .add("send", { emailId: email.id }, { jobId: email.id, delay })
        .catch((err) => {
          // A "job already exists" error is expected and harmless
          if (!err.message?.includes("already")) {
            console.error("reconcile enqueue error:", email.id, err.message);
          }
        });
    })
  );
}
