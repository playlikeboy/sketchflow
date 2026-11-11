import { expect, test } from "bun:test";

import { createRateLimiter } from "../src/server/rate-limit";

test("allows up to the limit, then blocks until the window resets", () => {
  let now = 1_000;
  const check = createRateLimiter(() => now);
  const rule = { limit: 2, windowMs: 10_000 };

  expect(check("commit:user-1", rule)).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  expect(check("commit:user-1", rule).allowed).toBe(true);

  now += 4_000;
  expect(check("commit:user-1", rule)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 6 });

  now += 6_000;
  expect(check("commit:user-1", rule).allowed).toBe(true);
});

test("tracks each key independently", () => {
  const check = createRateLimiter(() => 0);
  const rule = { limit: 1, windowMs: 1_000 };

  expect(check("commit:user-1", rule).allowed).toBe(true);
  expect(check("commit:user-1", rule).allowed).toBe(false);
  expect(check("commit:user-2", rule).allowed).toBe(true);
  expect(check("bootstrap:user-1", rule).allowed).toBe(true);
});
