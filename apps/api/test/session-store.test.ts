import { describe, expect, it } from "vitest";
import { createTestClock } from "@launchpad/testing";

import { MemorySessionStore } from "../src/session-store.js";

describe("MemorySessionStore", () => {
  it("returns active sessions", async () => {
    const store = new MemorySessionStore(createTestClock("2026-04-08T12:00:00.000Z"));

    await store.create({
      id: "session-1",
      userId: "user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2026-04-09T00:00:00.000Z",
      expiresAt: "2026-04-08T18:00:00.000Z",
      createdAt: "2026-04-08T12:00:00.000Z",
      updatedAt: "2026-04-08T12:00:00.000Z",
    });

    await expect(store.get("session-1")).resolves.toMatchObject({
      id: "session-1",
      userId: "user-1",
    });
  });

  it("drops expired sessions on read", async () => {
    const store = new MemorySessionStore(createTestClock("2026-04-08T12:00:00.000Z"));

    await store.create({
      id: "session-1",
      userId: "user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2026-04-09T00:00:00.000Z",
      expiresAt: "2026-04-08T11:59:59.000Z",
      createdAt: "2026-04-08T10:00:00.000Z",
      updatedAt: "2026-04-08T10:00:00.000Z",
    });

    await expect(store.get("session-1")).resolves.toBeUndefined();
    await expect(store.get("session-1")).resolves.toBeUndefined();
  });
});
