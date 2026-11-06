// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OllamaServiceError,
  polishResumeText,
} from "../../../src/service/ollama-service";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("polishResumeText", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.local:11434/");
    vi.stubEnv("OLLAMA_MODEL", "test-model");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts a summary prompt to the configured Ollama server", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ response: "  Polished summary.  " }));

    await expect(polishResumeText("My summary", "summary")).resolves.toBe(
      "Polished summary.",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ollama.local:11434/api/generate");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "test-model",
      stream: false,
      options: { temperature: 0.3 },
    });
    expect(body.prompt).toContain("Polish the following professional resume summary.");
    expect(body.prompt).toContain("2 to 4 sentences");
    expect(body.prompt).toMatch(/Text:\nMy summary$/);
  });

  it("uses the experience instructions for work descriptions", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ response: "Led the team." }));

    await polishResumeText("Was in charge of the team.", "experience");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.prompt).toContain("Polish the following work experience description");
    expect(body.prompt).toContain("action-oriented");
  });

  it("falls back to the default endpoint when no base URL is configured", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "");
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    fetchMock.mockResolvedValueOnce(jsonResponse({ response: "ok" }));

    await polishResumeText("text", "summary");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/generate");
    expect(JSON.parse(String(init?.body)).model).toBe("");
  });

  it.each([
    ["Summary: Polished.", "Polished."],
    ["Professional summary: Polished.", "Polished."],
    ["Experience description: Polished.", "Polished."],
    ["summary :Polished.", "Polished."],
  ])("strips a leading label from %j", async (response, expected) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ response }));

    await expect(polishResumeText("text", "summary")).resolves.toBe(expected);
  });

  it.each([
    "ftp://ollama.local",
    "http://user:pass@ollama.local",
    "http://ollama.local/?query=1",
    "http://ollama.local/#hash",
    "not a url",
  ])("rejects the invalid base URL %s with a 500", async (baseUrl) => {
    vi.stubEnv("OLLAMA_BASE_URL", baseUrl);

    const failure = polishResumeText("text", "summary");
    await expect(failure).rejects.toBeInstanceOf(OllamaServiceError);
    await expect(failure).rejects.toMatchObject({
      status: 500,
      message: "The local AI service is not configured correctly.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps connection failures to a 503", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(polishResumeText("text", "summary")).rejects.toMatchObject({
      name: "OllamaServiceError",
      status: 503,
      message:
        "Unable to reach Ollama. Check that the local AI server is running and try again.",
    });
  });

  it("maps non-OK responses to a 503", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "model not found" }, 404));

    await expect(polishResumeText("text", "summary")).rejects.toMatchObject({
      status: 503,
      message: "The local AI service could not polish the text.",
    });
  });

  it("maps invalid JSON to a 502", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));

    await expect(polishResumeText("text", "summary")).rejects.toMatchObject({
      status: 502,
      message: "The local AI returned an invalid response. Please try again.",
    });
  });

  it.each([
    ["a missing response field", { done: true }],
    ["a non-string response", { response: 1 }],
    ["a blank response", { response: "   " }],
    ["a label-only response", { response: "Summary:" }],
    ["an oversized response", { response: "x".repeat(10_001) }],
    ["a non-object payload", ["x"]],
  ])("rejects %s with a 502", async (_label, payload) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));

    await expect(polishResumeText("text", "summary")).rejects.toMatchObject({
      status: 502,
    });
  });
});
