// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../../src/app/api/register/route";

const { createPasswordUser, findAuthUserByEmail, hashPassword } = vi.hoisted(
  () => ({
    createPasswordUser: vi.fn(),
    findAuthUserByEmail: vi.fn(),
    hashPassword: vi.fn(),
  }),
);

vi.mock("../../../src/service/auth-service", () => ({
  createPasswordUser,
  findAuthUserByEmail,
}));
vi.mock("../../../src/lib/password", () => ({ hashPassword }));

const origin = "http://localhost:3000";

function registerRequest(
  body: unknown,
  { headers = {}, requestOrigin = origin }: {
    headers?: Record<string, string>;
    requestOrigin?: string | null;
  } = {},
) {
  const requestHeaders = new Headers({ "Content-Type": "application/json", ...headers });
  if (requestOrigin) requestHeaders.set("origin", requestOrigin);
  return new Request(`${origin}/api/register`, {
    method: "POST",
    headers: requestHeaders,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  name: "  Alex Morgan ",
  email: " Alex@Example.COM ",
  password: "password123",
};

describe("POST /api/register", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findAuthUserByEmail.mockResolvedValue(null);
    hashPassword.mockResolvedValue("scrypt$hash");
    createPasswordUser.mockResolvedValue({ id: "new-id" });
  });

  it("rejects cross-origin requests", async () => {
    const response = await POST(
      registerRequest(validBody, { requestOrigin: "https://evil.example.com" }),
    );

    expect(response.status).toBe(403);
    expect(createPasswordUser).not.toHaveBeenCalled();
  });

  it("rejects requests without an origin header", async () => {
    const response = await POST(registerRequest(validBody, { requestOrigin: null }));

    expect(response.status).toBe(403);
  });

  it("rejects oversized payloads by content-length", async () => {
    const response = await POST(
      registerRequest(validBody, { headers: { "content-length": "10001" } }),
    );

    expect(response.status).toBe(413);
  });

  it("rejects oversized bodies", async () => {
    const request = registerRequest({ ...validBody, name: "x".repeat(10_001) });
    request.headers.delete("content-length");

    const response = await POST(request);

    expect(response.status).toBe(413);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(registerRequest("{ nope"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Registration details must be valid JSON.",
    });
  });

  it("rejects non-object bodies", async () => {
    const response = await POST(registerRequest(["a"]));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Registration details are invalid.",
    });
  });

  it.each([
    ["a short name", { name: "A" }],
    ["a long name", { name: "A".repeat(101) }],
    ["a missing name", { name: undefined }],
    ["an invalid email", { email: "not-an-email" }],
    ["an email with spaces", { email: "a b@example.com" }],
    ["a long email", { email: `${"a".repeat(320)}@example.com` }],
    ["a short password", { password: "short" }],
    ["a long password", { password: "p".repeat(129) }],
    ["a non-string password", { password: 12345678 }],
  ])("rejects %s", async (_label, overrides) => {
    const response = await POST(registerRequest({ ...validBody, ...overrides }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Enter a valid name and email, and a password between 8 and 128 characters.",
    });
    expect(createPasswordUser).not.toHaveBeenCalled();
  });

  it("refuses to register an existing email", async () => {
    findAuthUserByEmail.mockResolvedValue({ id: "existing" });

    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(409);
    expect(findAuthUserByEmail).toHaveBeenCalledWith("alex@example.com");
    expect(createPasswordUser).not.toHaveBeenCalled();
  });

  it("creates the account with a trimmed name, lower-cased email and hashed password", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(hashPassword).toHaveBeenCalledWith("password123");
    expect(createPasswordUser).toHaveBeenCalledWith(
      "alex@example.com",
      "Alex Morgan",
      "scrypt$hash",
    );
  });

  it("maps a duplicate-key race to 409", async () => {
    createPasswordUser.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );

    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(409);
  });

  it("returns 503 for other database failures", async () => {
    createPasswordUser.mockRejectedValue(new Error("connection lost"));

    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to create your account right now.",
    });
  });
});
