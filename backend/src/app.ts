import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import session from "express-session";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { config } from "./config";
import { emailQueue } from "./lib/queue";
import { errorHandler } from "./middleware/errorHandler";
import authRouter from "./routes/auth";
import emailsRouter from "./routes/emails";
import slackRouter from "./routes/slack";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: config.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: config.NODE_ENV === "production", httpOnly: true },
  })
);

// Bull Board UI at /admin/queues
const bullAdapter = new ExpressAdapter();
bullAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(emailQueue) as any],
  serverAdapter: bullAdapter,
});
app.use("/admin/queues", bullAdapter.getRouter());

app.use("/auth", authRouter);
app.use("/api/emails", emailsRouter);
app.use("/auth/slack", slackRouter);

app.use(errorHandler);

export default app;
