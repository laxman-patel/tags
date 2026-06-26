const buckets = new Map<string, { tokens: number; lastRefill: number }>();

const REFILL_INTERVAL_MS = 60_000;
const DEFAULT_CAPACITY = 45;

export class SlackRateLimiter {
  constructor(private capacity = DEFAULT_CAPACITY) {}

  async acquire(channelId: string): Promise<void> {
    const now = Date.now();
    let bucket = buckets.get(channelId);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      buckets.set(channelId, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed >= REFILL_INTERVAL_MS) {
      bucket.tokens = this.capacity;
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      const waitMs = REFILL_INTERVAL_MS - elapsed;
      await sleep(Math.max(waitMs, 500));
      bucket.tokens = this.capacity;
      bucket.lastRefill = Date.now();
    }

    bucket.tokens -= 1;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const globalSlackRateLimiter = new SlackRateLimiter();
