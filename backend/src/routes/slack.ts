import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { config } from "../config";
import prisma from "../lib/prisma";
import redis from "../lib/redis";

const router = Router();

// Slack OAuth: initiate
router.get("/connect", requireAuth, (_req: Request, res: Response) => {
  if (!config.SLACK_CLIENT_ID || !config.SLACK_REDIRECT_URI) {
    return res.status(503).json({ error: "Slack not configured" });
  }
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", config.SLACK_CLIENT_ID);
  url.searchParams.set("scope", "chat:write");
  url.searchParams.set("user_scope", "chat:write");
  url.searchParams.set("redirect_uri", config.SLACK_REDIRECT_URI);
  res.redirect(url.toString());
});

// Slack OAuth: callback
router.get("/callback", requireAuth, async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) return res.redirect(`${config.FRONTEND_URL}/dashboard?slack=error`);

  const params = new URLSearchParams({
    code,
    client_id: config.SLACK_CLIENT_ID!,
    client_secret: config.SLACK_CLIENT_SECRET!,
    redirect_uri: config.SLACK_REDIRECT_URI!,
  });

  const resp = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = (await resp.json()) as { ok: boolean; authed_user?: { id: string; access_token: string } };

  if (!data.ok || !data.authed_user) {
    return res.redirect(`${config.FRONTEND_URL}/dashboard?slack=error`);
  }

  await prisma.user.update({
    where: { id: req.currentUser!.userId },
    data: {
      slackToken: data.authed_user.access_token,
      slackUserId: data.authed_user.id,
    },
  });

  res.redirect(`${config.FRONTEND_URL}/dashboard?slack=connected`);
});

router.post("/disconnect", requireAuth, async (req: Request, res: Response) => {
  await prisma.user.update({
    where: { id: req.currentUser!.userId },
    data: { slackToken: null, slackUserId: null },
  });
  // Clear any rate-limit guard keys for this user's senders
  res.json({ ok: true });
});

export default router;
