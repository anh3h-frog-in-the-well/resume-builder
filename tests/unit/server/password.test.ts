// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../../src/lib/password";

describe("password hashing", () => {
  it("produces a salted scrypt hash that verifies", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("uses a fresh salt for every hash", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    expect(first).not.toBe(second);
    await expect(verifyPassword("same password", second)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("right");

    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it.each([
    ["an unknown algorithm", "bcrypt$" + "a".repeat(32) + "$" + "b".repeat(128)],
    ["a short salt", "scrypt$abc$" + "b".repeat(128)],
    ["a short key", "scrypt$" + "a".repeat(32) + "$abc"],
    ["non-hex characters", "scrypt$" + "z".repeat(32) + "$" + "b".repeat(128)],
    ["an empty string", ""],
    ["a hash without separators", "scrypt"],
  ])("rejects a malformed hash with %s", async (_label, encoded) => {
    await expect(verifyPassword("anything", encoded)).resolves.toBe(false);
  });
});
