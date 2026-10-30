import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import {
  OllamaServiceError,
  polishResumeText,
} from "../../../service/ollama-service";

const maxDescriptionLength = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in to polish your work experience." },
      { status: 401 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxDescriptionLength + 100) {
    return NextResponse.json(
      { error: "The work experience description is too long." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    const requestBody = await request.text();
    if (requestBody.length > maxDescriptionLength + 100) {
      return NextResponse.json(
        { error: "The work experience description is too long." },
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

  const description =
    isRecord(body) && typeof body.description === "string"
      ? body.description.trim()
      : "";
  if (!description || description.length > maxDescriptionLength) {
    return NextResponse.json(
      {
        error: description
          ? "The work experience description is too long."
          : "Enter a work experience description before polishing it.",
      },
      { status: 400 },
    );
  }

  try {
    const polishedDescription = await polishResumeText(
      description,
      "experience",
    );
    return NextResponse.json({ description: polishedDescription });
  } catch (error) {
    if (error instanceof OllamaServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Unable to polish the work experience description.", error);
    return NextResponse.json(
      { error: "Unable to polish the description. Please try again." },
      { status: 500 },
    );
  }
}
