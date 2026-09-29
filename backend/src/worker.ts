import "./config";
import { Worker } from "bullmq";
import redis from "./lib/redis";
import { config } from "./config";

// Worker stub - will be filled in phase 2
const worker = new Worker(
  "emails",
  async (job) => {
    console.log("processing job", job.id, job.data);
  },
  {
    connection: redis,
    concurrency: config.WORKER_CONCURRENCY,
  }
);

worker.on("completed", (job) => console.log("job completed", job.id));
worker.on("failed", (job, err) => console.error("job failed", job?.id, err.message));

console.log("worker started, concurrency:", config.WORKER_CONCURRENCY);
