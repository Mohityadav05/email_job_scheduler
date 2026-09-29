import "./config"; // validate env vars first
import app from "./app";
import { config } from "./config";
import prisma from "./lib/prisma";

async function main() {
  await prisma.$connect();
  console.log("database connected");

  app.listen(config.PORT, () => {
    console.log(`server listening on port ${config.PORT}`);
  });
}

main().catch((err) => {
  console.error("startup error:", err);
  process.exit(1);
});
