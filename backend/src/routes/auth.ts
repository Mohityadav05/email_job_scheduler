import { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import { config } from "../config";
import prisma from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value ?? "";
        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: { name: profile.displayName, avatar: profile.photos?.[0]?.value },
          create: {
            googleId: profile.id,
            email,
            name: profile.displayName,
            avatar: profile.photos?.[0]?.value,
          },
        });
        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    }
  )
);

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${config.FRONTEND_URL}/login?error=auth_failed`,
  }),
  (req: Request, res: Response) => {
    // After passport authenticates, req.user is the Prisma User object
    const passportUser = req.user as { id: string; email: string };
    const token = jwt.sign(
      { userId: passportUser.id, email: passportUser.email },
      config.JWT_SECRET as jwt.Secret,
      { expiresIn: "7d" }
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${config.FRONTEND_URL}/dashboard`);
  }
);

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.currentUser!.userId },
    select: { id: true, email: true, name: true, avatar: true, slackUserId: true },
  });
  res.json(user);
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

export default router;
