import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import {
  OllamaServiceError,
  polishResumeText,
} from "../../../service/ollama-service";

const maxSummaryLength = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to polish your professional summary." },
      { status: 401 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxSummaryLength + 100) {
    return NextResponse.json(
      { error: "The professional summary is too long." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    const requestBody = await request.text();
    if (requestBody.length > maxSummaryLength + 100) {
      return NextResponse.json(
        { error: "The professional summary is too long." },
        { status: 413 },
      );
    }
    body = JSON.parse(requestBody);
  } catch {
    return NextResponse.json(
      { error: "The request must contain valid JSON." },
      { status: 400 },
    );
  }

  const summary = isRecord(body) && typeof body.summary === "string"
    ? body.summary.trim()
    : "";
  if (!summary || summary.length > maxSummaryLength) {
    return NextResponse.json(
      {
        error: summary
          ? "The professional summary is too long."
          : "Enter a professional summary before polishing it.",
      },
      { status: 400 },
    );
  }

  try {
    const polishedSummary = await polishResumeText(summary, "summary");
    return NextResponse.json({ summary: polishedSummary });
  } catch (error) {
    if (error instanceof OllamaServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Unable to polish the professional summary.", error);
    return NextResponse.json(
      { error: "Unable to polish the summary. Please try again." },
      { status: 500 },
    );
  }
}
