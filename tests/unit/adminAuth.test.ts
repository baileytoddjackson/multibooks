import { describe, expect, it } from "vitest";
import { createAdminToken, passwordMatches, verifyAdminToken } from "@/lib/admin/auth";

describe("admin auth", () => {
  it("checks the password exactly", () => {
    expect(passwordMatches("open sesame", "open sesame")).toBe(true);
    expect(passwordMatches("open sesam", "open sesame")).toBe(false);
    expect(passwordMatches("open sesame!", "open sesame")).toBe(false);
    expect(passwordMatches("", undefined)).toBe(false);
  });

  it("issues tokens that verify until they expire", () => {
    const t = createAdminToken("secret", 1_000);
    expect(verifyAdminToken(t, "secret", 2_000)).toBe(true);
    expect(verifyAdminToken(t, "secret", 1_000 + 9 * 3600_000)).toBe(false);
  });

  it("rejects tampered or foreign tokens", () => {
    const t = createAdminToken("secret", 1_000);
    const [exp, mac] = t.split(".");
    expect(verifyAdminToken(`${Number(exp) + 999999}.${mac}`, "secret", 2_000)).toBe(false);
    expect(verifyAdminToken(t, "other-secret", 2_000)).toBe(false);
    expect(verifyAdminToken("garbage", "secret", 2_000)).toBe(false);
    expect(verifyAdminToken(undefined, "secret")).toBe(false);
  });
});
