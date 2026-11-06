import { NextResponse } from "next/server";

export type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse };

type JsonBodyOptions = {
  /** Upper bound for the request body in bytes. */
  maxSize: number;
  /** Error message returned when the body exceeds `maxSize`. */
  tooLargeMessage: string;
  /** Error message returned when the body is not valid JSON. */
  invalidMessage: string;
};

/**
 * Reads and parses a JSON request body while enforcing a size limit, both from
 * the declared content-length and from the bytes actually received.
 */
export async function readJsonBody(
  request: Request,
  { maxSize, tooLargeMessage, invalidMessage }: JsonBodyOptions,
): Promise<JsonBodyResult> {
  const tooLarge = () => ({
    ok: false as const,
    response: NextResponse.json({ error: tooLargeMessage }, { status: 413 }),
  });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxSize) return tooLarge();

  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unable to read the request body." },
        { status: 400 },
      ),
    };
  }
  if (text.length > maxSize) return tooLarge();

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: invalidMessage }, { status: 400 }),
    };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
