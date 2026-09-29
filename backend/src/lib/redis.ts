import { Redis } from "ioredis";
import { config } from "../config";

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
});

redis.on("error", (err) => {
  console.error("redis error:", err.message);
});

export default redis;
