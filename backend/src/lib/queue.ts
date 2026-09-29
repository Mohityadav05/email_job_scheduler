import { Queue } from "bullmq";
import redis from "./redis";

export const emailQueue = new Queue("emails", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});
