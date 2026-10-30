import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import {
  getResumeDraft,
  saveResumeDraft,
} from "../../../service/resume-service";
import { normalizeResume } from "../../../util/resume-helper";

const maxRequestSize = 1_000_000;

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  console.log('userId', userId)
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication is required to access your resume." },
      { status: 401 },
    );
  }

  try {
    const resume = await getResumeDraft(userId);
    if (!resume) {
      return NextResponse.json(
        { error: "No resume draft was found for this account." },
        { status: 404 },
      );
    }
    return NextResponse.json(resume);
  } catch (error) {
    console.error("Unable to load resume from MySQL.", error);
    return NextResponse.json(
      { error: "Unable to load your resume from the database." },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxRequestSize) {
    return NextResponse.json(
      { error: "The resume data is too large." },
      { status: 413 },
    );
  }

  let requestBody: string;
  try {
    requestBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Unable to read the request body." },
      { status: 400 },
    );
  }

  if (requestBody.length > maxRequestSize) {
    return NextResponse.json(
      { error: "The resume data is too large." },
      { status: 413 },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(requestBody);
  } catch {
    return NextResponse.json(
      { error: "The request body must contain valid JSON." },
      { status: 400 },
    );
  }

  const resume = normalizeResume(parsedBody);
  if (!resume) {
    return NextResponse.json(
      { error: "The resume data is invalid." },
      { status: 400 },
    );
  }

  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication is required to edit your resume." },
        { status: 401 },
      );
    }

    await saveResumeDraft(userId, resume);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to save resume to MySQL.", error);
    return NextResponse.json(
      { error: "Unable to save your resume to the database." },
      { status: 503 },
    );
  }
}
