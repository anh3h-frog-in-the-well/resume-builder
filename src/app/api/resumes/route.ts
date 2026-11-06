import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { isRecord, readJsonBody } from "../../../lib/request-body";
import {
  createResumeVersion,
  listResumeVersions,
  ResumeServiceError,
} from "../../../service/resume-service";
import {
  createBlankResume,
  normalizeResume,
  normalizeResumeTitle,
} from "../../../util/resume-helper";

const maxRequestSize = 1_000_000;

const authError = NextResponse.json(
  { error: "Authentication is required to access your resumes." },
  { status: 401 },
);

/** Lists the signed-in account's resume versions. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return authError;

  try {
    return NextResponse.json(await listResumeVersions(userId));
  } catch (error) {
    console.error("Unable to list resumes from the database.", error);
    return NextResponse.json(
      { error: "Unable to load your resumes from the database." },
      { status: 503 },
    );
  }
}

/**
 * Creates a resume version. The body may carry a `title` and a `resume` to
 * start from (for example to duplicate an existing one); both are optional.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return authError;

  const parsed = await readJsonBody(request, {
    maxSize: maxRequestSize,
    tooLargeMessage: "The resume data is too large.",
    invalidMessage: "The request body must contain valid JSON.",
  });
  if (!parsed.ok) return parsed.response;
  if (!isRecord(parsed.body)) {
    return NextResponse.json(
      { error: "The request body is invalid." },
      { status: 400 },
    );
  }

  const title =
    parsed.body.title === undefined
      ? "Untitled resume"
      : normalizeResumeTitle(parsed.body.title);
  if (!title) {
    return NextResponse.json(
      { error: "Enter a resume title of up to 80 characters." },
      { status: 400 },
    );
  }

  const resume =
    parsed.body.resume === undefined
      ? createBlankResume()
      : normalizeResume(parsed.body.resume);
  if (!resume) {
    return NextResponse.json(
      { error: "The resume data is invalid." },
      { status: 400 },
    );
  }

  try {
    const created = await createResumeVersion(userId, title, resume);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ResumeServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Unable to create a resume in the database.", error);
    return NextResponse.json(
      { error: "Unable to create the resume in the database." },
      { status: 503 },
    );
  }
}
