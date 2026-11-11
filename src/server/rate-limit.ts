// Fixed-window rate limiter kept in memory.
//
// On Cloudflare Workers each isolate has its own memory, so this bounds bursts per isolate
// rather than globally. It is a cheap first line of defence for routes that write to GitHub;
// a Cloudflare Rate Limiting binding is the durable replacement.

export type RateLimitRule = {
	limit: number;
	windowMs: number;
};

export type RateLimitResult = {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
};

type Bucket = {
	count: number;
	resetAt: number;
};

const MAX_TRACKED_KEYS = 5_000;

export function createRateLimiter(now: () => number = Date.now) {
	const buckets = new Map<string, Bucket>();

	function prune(currentTime: number) {
		for (const [key, bucket] of buckets) {
			if (bucket.resetAt <= currentTime) {
				buckets.delete(key);
			}
		}
	}

	return function check(key: string, rule: RateLimitRule): RateLimitResult {
		const currentTime = now();
		const existing = buckets.get(key);

		if (!existing || existing.resetAt <= currentTime) {
			if (buckets.size >= MAX_TRACKED_KEYS) {
				prune(currentTime);
			}
			buckets.set(key, { count: 1, resetAt: currentTime + rule.windowMs });
			return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
		}

		if (existing.count >= rule.limit) {
			return {
				allowed: false,
				remaining: 0,
				retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000)),
			};
		}

		existing.count += 1;
		return { allowed: true, remaining: rule.limit - existing.count, retryAfterSeconds: 0 };
	};
}

export const RATE_LIMITS = {
	// Snapshot commits are debounced on the client; this only stops runaway loops.
	commit: { limit: 60, windowMs: 60_000 },
	// Creating, forking and restoring projects each write a multi-file commit.
	projectWrite: { limit: 20, windowMs: 60_000 },
	// Bootstrapping can create a repository.
	bootstrap: { limit: 5, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;
