import prisma from "./prisma";
import { config } from "../config";
import redis from "./redis";

// Posts a Slack DM to the user who owns the sender that just hit its limit.
// The SET NX guard prevents duplicate messages within the same hour window.
export async function notifySlackRateLimit(senderId: string, userId: string) {
  const window = Math.floor(Date.now() / 3_600_000);
  const guardKey = `slack:notified:${senderId}:${window}`;
  const acquired = await redis.set(guardKey, "1", "EX", 7200, "NX");
  if (!acquired) return; // already notified this hour

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { slackToken: true, slackUserId: true },
  });

  if (!user?.slackToken || !user.slackUserId) return; // Slack not connected

  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.slackToken}`,
      },
      body: JSON.stringify({
        channel: user.slackUserId,
        text: `Sender ${senderId} has hit the hourly email limit of ${config.MAX_EMAILS_PER_HOUR_PER_SENDER}. Affected jobs will resume in the next hour window.`,
      }),
    });
  } catch (err) {
    // Slack is best-effort; never crash the worker over a notification failure
    console.error("slack notify failed:", (err as Error).message);
  }
}
