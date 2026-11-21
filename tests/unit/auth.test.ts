import { describe, expect, it } from "vitest";
import { accessCodeMatches } from "@/lib/auth/accessCode";
import { isPublicPath, safeNextPath } from "@/lib/auth/constants";
import { hashToken, safeEqual } from "@/lib/auth/crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { BookProgressSchema, CyoStorySchema } from "@/lib/schemas/userData";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batter", hash)).toBe(false);
    expect(await verifyPassword("correct horse battery", "not-a-hash")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});

describe("access code", () => {
  it("matches ignoring case and surrounding spaces", () => {
    expect(accessCodeMatches("  pilot-2026 ", "PILOT-2026")).toBe(true);
    expect(accessCodeMatches("PILOT-2025", "PILOT-2026")).toBe(false);
    expect(accessCodeMatches("", "PILOT-2026")).toBe(false);
  });

  it("closes sign-up when no code is configured", () => {
    expect(accessCodeMatches("", undefined)).toBe(false);
    expect(accessCodeMatches("anything", "  ")).toBe(false);
  });
});

describe("crypto helpers", () => {
  it("compares strings exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("hashes tokens deterministically", () => {
    expect(hashToken("t")).toBe(hashToken("t"));
    expect(hashToken("t")).not.toBe("t");
  });
});

describe("routing rules", () => {
  it("knows which paths are public", () => {
    for (const p of ["/login", "/signup", "/api/auth/login", "/api/events", "/admin/stats"]) {
      expect(isPublicPath(p)).toBe(true);
    }
    for (const p of ["/", "/book/alice", "/api/me", "/api/detour", "/loginx", "/signups"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it("only returns to same-site paths after sign-in", () => {
    expect(safeNextPath("/read/alice/2?mode=canon")).toBe("/read/alice/2?mode=canon");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("saved data validation", () => {
  it("accepts valid book progress and rejects junk", () => {
    const ok = {
      bookId: "alice",
      mode: "adventure",
      position: "c001p004",
      fraction: 0.2,
      wordsRead: 10,
      updatedAt: 1,
      adventure: { style: "direct", history: [{ cpId: "cp01", kind: "original" }] },
    };
    expect(BookProgressSchema.safeParse(ok).success).toBe(true);
    expect(BookProgressSchema.safeParse({ ...ok, bookId: "dracula" }).success).toBe(false);
    expect(BookProgressSchema.safeParse({ ...ok, fraction: 2 }).success).toBe(false);
  });

  it("caps story sizes", () => {
    const story = {
      id: "0b6c1f7e-1111-2222-3333-444455556666",
      title: "T",
      genre: "mystery",
      setting: "S",
      segments: [{ text: "x", summary: "y", choices: [] }],
      cast: [],
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    };
    expect(CyoStorySchema.safeParse(story).success).toBe(true);
    const huge = { ...story, segments: [{ text: "x".repeat(9000), summary: "", choices: [] }] };
    expect(CyoStorySchema.safeParse(huge).success).toBe(false);
  });
});
