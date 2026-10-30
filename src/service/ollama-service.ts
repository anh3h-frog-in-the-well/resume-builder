const maxTextLength = 10_000;
const defaultOllamaBaseUrl = "http://localhost:11434";
const defaultModel = "";

type ResumeTextType = "summary" | "experience";

export class OllamaServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OllamaServiceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOllamaEndpoint() {
  let ollamaUrl: URL;
  try {
    ollamaUrl = new URL(
      process.env.OLLAMA_BASE_URL ?? defaultOllamaBaseUrl,
    );
    if (
      !["http:", "https:"].includes(ollamaUrl.protocol) ||
      ollamaUrl.username ||
      ollamaUrl.password ||
      ollamaUrl.search ||
      ollamaUrl.hash
    ) {
      throw new Error("OLLAMA_BASE_URL is invalid.");
    }
  } catch (error) {
    console.error("Invalid local Ollama configuration.", error);
    throw new OllamaServiceError(
      "The local AI service is not configured correctly.",
      500,
    );
  }

  return `${ollamaUrl.toString().replace(/\/+$/, "")}/api/generate`;
}

function createPrompt(text: string, kind: ResumeTextType) {
  const instructions =
    kind === "summary"
      ? [
          "Polish the following professional resume summary.",
          "Keep its original meaning, experience, and claims; do not invent details.",
          "Use clear, concise, confident professional language in 2 to 4 sentences.",
          "Return only the polished summary, without quotes or commentary.",
        ]
      : [
          "Polish the following work experience description for a resume.",
          "Keep its original meaning, experience, metrics, and claims; do not invent details.",
          "Use clear, concise, action-oriented professional language.",
          "Return only the polished description, without quotes or commentary.",
        ];

  return [...instructions, "", "Text:", text].join("\n");
}

export async function polishResumeText(
  text: string,
  kind: ResumeTextType,
) {
  const endpoint = getOllamaEndpoint();

  let ollamaResponse: Response;
  try {
    ollamaResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? defaultModel,
        stream: false,
        prompt: createPrompt(text, kind),
        options: { temperature: 0.3 },
      }),
    });
  } catch (error) {
    console.error("Unable to connect to the local Ollama service.", error);
    throw new OllamaServiceError(
      "Unable to reach Ollama. Check that the local AI server is running and try again.",
      503,
    );
  }

  if (!ollamaResponse.ok) {
    console.error(`Local Ollama returned HTTP ${ollamaResponse.status}.`);
    throw new OllamaServiceError(
      "The local AI service could not polish the text.",
      503,
    );
  }

  let result: unknown;
  try {
    result = await ollamaResponse.json();
  } catch (error) {
    console.error("Local Ollama returned invalid JSON.", error);
    throw new OllamaServiceError(
      "The local AI returned an invalid response. Please try again.",
      502,
    );
  }

  const polishedText =
    isRecord(result) && typeof result.response === "string"
      ? result.response
          .trim()
          .replace(
            /^(?:(?:professional\s+)?summary|experience\s+description)\s*:\s*/i,
            "",
          )
          .trim()
      : "";
  if (!polishedText || polishedText.length > maxTextLength) {
    console.error("Local Ollama returned an invalid resume text response.");
    throw new OllamaServiceError(
      "The local AI returned an invalid response. Please try again.",
      502,
    );
  }

  return polishedText;
}
