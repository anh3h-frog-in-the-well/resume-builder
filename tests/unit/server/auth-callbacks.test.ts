// @vitest-environment node
import type { NextAuthConfig } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ config: null as NextAuthConfig | null }));
const services = vi.hoisted(() => ({
  findAuthUserByEmail: vi.fn(),
  createPasswordUser: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    captured.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: unknown) => ({ id: "credentials", type: "credentials", options }),
}));
vi.mock("next-auth/providers/google", () => ({
  default: (options: unknown) => ({ id: "google", type: "oauth", options }),
}));
vi.mock("../../../src/service/auth-service", () => ({
  findAuthUserByEmail: services.findAuthUserByEmail,
  createPasswordUser: services.createPasswordUser,
}));
vi.mock("../../../src/lib/password", () => ({
  hashPassword: services.hashPassword,
  verifyPassword: services.verifyPassword,
}));

await import("../../../src/auth");

type Callbacks = Required<NonNullable<NextAuthConfig["callbacks"]>>;
const callbacks = () => captured.config?.callbacks as Callbacks;
const call = <T>(value: T) => value as never;

const dbUser = { id: "db-account-id", email: "erin@example.com", name: "Erin", passwordHash: "x" };

describe("auth callbacks", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("uses a JWT session and the custom login page", () => {
    expect(captured.config).toMatchObject({
      session: { strategy: "jwt" },
      pages: { signIn: "/login" },
    });
  });

  describe("jwt", () => {
    it("stores the account id directly for credentials sign-ins", async () => {
      const token = await callbacks().jwt(
        call({
          token: { email: "erin@example.com" },
          user: { id: "db-account-id", email: "erin@example.com" },
          account: { provider: "credentials", type: "credentials", providerAccountId: "x" },
        }),
      );

      expect(token).toMatchObject({ sub: "db-account-id", accountId: "db-account-id" });
      expect(services.findAuthUserByEmail).not.toHaveBeenCalled();
    });

    it("looks the account up by email for Google sign-ins", async () => {
      services.findAuthUserByEmail.mockResolvedValue(dbUser);

      const token = await callbacks().jwt(
        call({
          token: { email: "erin@example.com" },
          user: { id: "google-subject", email: "erin@example.com" },
          account: { provider: "google", type: "oauth", providerAccountId: "google-subject" },
        }),
      );

      expect(token).toMatchObject({ sub: "google-subject", accountId: "db-account-id" });
      expect(services.findAuthUserByEmail).toHaveBeenCalledWith("erin@example.com");
    });

    it("does not query the database once the account id is known", async () => {
      const token = await callbacks().jwt(
        call({ token: { sub: "s", email: "erin@example.com", accountId: "db-account-id" } }),
      );

      expect(token).toMatchObject({ accountId: "db-account-id" });
      expect(services.findAuthUserByEmail).not.toHaveBeenCalled();
    });

    it("upgrades tokens issued before the account id was stored", async () => {
      services.findAuthUserByEmail.mockResolvedValue(dbUser);

      const token = await callbacks().jwt(
        call({ token: { sub: "google-subject", email: "erin@example.com" } }),
      );

      expect(token).toMatchObject({ accountId: "db-account-id" });
    });

    it("leaves the token usable when the database is unavailable", async () => {
      services.findAuthUserByEmail.mockRejectedValue(new Error("ECONNREFUSED"));

      const token = await callbacks().jwt(
        call({ token: { sub: "google-subject", email: "erin@example.com" } }),
      );

      expect(token).toMatchObject({ sub: "google-subject" });
      expect(token?.accountId).toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    });

    it("leaves the token alone when no account matches the email", async () => {
      services.findAuthUserByEmail.mockResolvedValue(null);

      const token = await callbacks().jwt(call({ token: { sub: "s", email: "nobody@example.com" } }));

      expect(token?.accountId).toBeUndefined();
    });
  });

  describe("session", () => {
    it("exposes the stored account id without touching the database", async () => {
      const session = await callbacks().session(
        call({
          session: { user: { email: "erin@example.com" }, expires: "2099-01-01T00:00:00.000Z" },
          token: { sub: "google-subject", accountId: "db-account-id" },
        }),
      );

      expect(session.user).toMatchObject({ id: "db-account-id" });
      expect(services.findAuthUserByEmail).not.toHaveBeenCalled();
    });

    it("falls back to the token subject", async () => {
      const session = await callbacks().session(
        call({
          session: { user: { email: "erin@example.com" }, expires: "2099-01-01T00:00:00.000Z" },
          token: { sub: "token-subject" },
        }),
      );

      expect(session.user).toMatchObject({ id: "token-subject" });
    });
  });

  describe("signIn", () => {
    it("creates an account for first-time Google users", async () => {
      services.findAuthUserByEmail.mockResolvedValue(null);
      services.hashPassword.mockResolvedValue("scrypt$empty");

      const allowed = await callbacks().signIn(
        call({
          user: { id: "google-subject" },
          account: { provider: "google" },
          profile: { email: "new@example.com", name: "New User" },
        }),
      );

      expect(allowed).toBe(true);
      expect(services.createPasswordUser).toHaveBeenCalledWith("new@example.com", "New User", "scrypt$empty");
    });

    it("does not recreate existing Google users", async () => {
      services.findAuthUserByEmail.mockResolvedValue(dbUser);

      await callbacks().signIn(
        call({ user: { id: "g" }, account: { provider: "google" }, profile: { email: dbUser.email, name: "Erin" } }),
      );

      expect(services.createPasswordUser).not.toHaveBeenCalled();
    });

    it("allows credentials sign-ins without a profile", async () => {
      const allowed = await callbacks().signIn(
        call({ user: { id: "db-account-id" }, account: { provider: "credentials" } }),
      );

      expect(allowed).toBe(true);
      expect(services.findAuthUserByEmail).not.toHaveBeenCalled();
    });
  });

  describe("credentials provider", () => {
    const authorize = () => {
      const provider = captured.config?.providers.find(
        (entry) => (entry as { id: string }).id === "credentials",
      ) as unknown as {
        options: { authorize: (credentials: Record<string, unknown>) => Promise<unknown> };
      };
      return provider.options.authorize;
    };

    it.each([
      ["a missing email", { password: "password123" }],
      ["a short password", { email: "erin@example.com", password: "short" }],
      ["an over-long password", { email: "erin@example.com", password: "p".repeat(129) }],
      ["an over-long email", { email: `${"a".repeat(320)}@x.io`, password: "password123" }],
    ])("rejects %s before touching the database", async (_label, credentials) => {
      await expect(authorize()(credentials)).resolves.toBeNull();
      expect(services.findAuthUserByEmail).not.toHaveBeenCalled();
    });

    it("rejects unknown users and wrong passwords", async () => {
      services.findAuthUserByEmail.mockResolvedValueOnce(null);
      await expect(
        authorize()({ email: "nobody@example.com", password: "password123" }),
      ).resolves.toBeNull();

      services.findAuthUserByEmail.mockResolvedValueOnce(dbUser);
      services.verifyPassword.mockResolvedValueOnce(false);
      await expect(
        authorize()({ email: "erin@example.com", password: "wrong-password" }),
      ).resolves.toBeNull();
    });

    it("returns the account for valid credentials, normalising the email", async () => {
      services.findAuthUserByEmail.mockResolvedValueOnce(dbUser);
      services.verifyPassword.mockResolvedValueOnce(true);

      await expect(
        authorize()({ email: "  Erin@Example.com ", password: "password123" }),
      ).resolves.toEqual({ id: "db-account-id", email: "erin@example.com", name: "Erin" });
      expect(services.findAuthUserByEmail).toHaveBeenCalledWith("erin@example.com");
      expect(services.verifyPassword).toHaveBeenCalledWith("password123", "x");
    });
  });
});
