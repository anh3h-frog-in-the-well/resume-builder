// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as polishExperience } from "../../../src/app/api/polish-experience/route";
import { POST as polishSummary } from "../../../src/app/api/polish-summary/route";
import { OllamaServiceError } from "../../../src/service/ollama-service";

const { auth, polishResumeText } = vi.hoisted(() => ({
  auth: vi.fn(),
  polishResumeText: vi.fn(),
}));

vi.mock("../../../src/auth", () => ({ auth }));
vi.mock("../../../src/service/ollama-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/ollama-service")>();
  return { ...actual, polishResumeText };
});

function postRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const routes = [
  {
    name: "polish-summary",
    handler: polishSummary,
    path: "/api/polish-summary",
    field: "summary",
    kind: "summary",
    authError: "Sign in to polish your professional summary.",
    tooLong: "The professional summary is too long.",
    empty: "Enter a professional summary before polishing it.",
    generic: "Unable to polish the summary. Please try again.",
  },
  {
    name: "polish-experience",
    handler: polishExperience,
    path: "/api/polish-experience",
    field: "description",
    kind: "experience",
    authError: "Sign in to polish your work experience.",
    tooLong: "The work experience description is too long.",
    empty: "Enter a work experience description before polishing it.",
    generic: "Unable to polish the description. Please try again.",
  },
] as const;

describe.each(routes)("POST $path", (route) => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.mockResolvedValue({ user: { id: "user-1" } });
    polishResumeText.mockResolvedValue("Polished text.");
  });

  it("requires authentication", async () => {
    auth.mockResolvedValue(null);

    const response = await route.handler(
      postRequest(route.path, { [route.field]: "text" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: route.authError });
    expect(polishResumeText).not.toHaveBeenCalled();
  });

  it("rejects oversized payloads by content-length", async () => {
    const response = await route.handler(
      postRequest(route.path, { [route.field]: "text" }, { "content-length": "10101" }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: route.tooLong });
  });

  it("rejects oversized bodies", async () => {
    const request = postRequest(route.path, { [route.field]: "x".repeat(10_101) });
    request.headers.delete("content-length");

    const response = await route.handler(request);

    expect(response.status).toBe(413);
  });

  it("rejects text above the limit after trimming", async () => {
    const request = postRequest(route.path, { [route.field]: "x".repeat(10_001) });
    request.headers.delete("content-length");

    const response = await route.handler(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: route.tooLong });
  });

  it("rejects malformed JSON", async () => {
    const response = await route.handler(postRequest(route.path, "{ nope"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The request must contain valid JSON.",
    });
  });

  it.each([
    ["a missing field", {}],
    ["a blank field", { [route.field]: "   " }],
    ["a non-string field", { [route.field]: 5 }],
    ["a non-object body", "[]"],
  ])("rejects %s", async (_label, body) => {
    const response = await route.handler(postRequest(route.path, body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: route.empty });
  });

  it("returns the polished text", async () => {
    const response = await route.handler(
      postRequest(route.path, { [route.field]: "  Original text.  " }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      [route.field]: "Polished text.",
    });
    expect(polishResumeText).toHaveBeenCalledWith("Original text.", route.kind);
  });

  it("passes through Ollama service errors with their status", async () => {
    polishResumeText.mockRejectedValue(
      new OllamaServiceError("Unable to reach Ollama.", 503),
    );

    const response = await route.handler(
      postRequest(route.path, { [route.field]: "text" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to reach Ollama.",
    });
  });

  it("returns 500 for unexpected failures", async () => {
    polishResumeText.mockRejectedValue(new Error("boom"));

    const response = await route.handler(
      postRequest(route.path, { [route.field]: "text" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: route.generic });
  });
});
