import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { isRecord, readJsonBody } from "../../../../lib/request-body";
import {
  deleteResumeVersion,
  getResumeVersion,
  renameResumeVersion,
  ResumeServiceError,
  saveResumeVersion,
} from "../../../../service/resume-service";
import {
  isResumeVersionId,
  normalizeResume,
  normalizeResumeTitle,
} from "../../../../util/resume-helper";

const maxRequestSize = 1_000_000;

type RouteContext = { params: Promise<{ id: string }> };

const authError = () =>
  NextResponse.json(
    { error: "Authentication is required to access your resumes." },
    { status: 401 },
  );

const notFound = () =>
  NextResponse.json({ error: "This resume was not found." }, { status: 404 });

const databaseError = (action: string, error: unknown) => {
  console.error(`Unable to ${action} the resume in the database.`, error);
  return NextResponse.json(
    { error: `Unable to ${action} the resume in the database.` },
    { status: 503 },
  );
};

type ResolvedRequest =
  | { ok: true; userId: string; id: string }
  | { ok: false; response: NextResponse };

/** Checks the session and the id parameter shared by every method. */
async function resolveRequest(context: RouteContext): Promise<ResolvedRequest> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, response: authError() };

  const { id } = await context.params;
  if (!isResumeVersionId(id)) return { ok: false, response: notFound() };

  return { ok: true, userId, id };
}

/** Returns one resume version with its content. */
export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const target = await resolveRequest(context);
  if (!target.ok) return target.response;

  try {
    const version = await getResumeVersion(target.userId, target.id);
    return version ? NextResponse.json(version) : notFound();
  } catch (error) {
    return databaseError("load", error);
  }
}

/** Replaces the content of a resume version. */
export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const target = await resolveRequest(context);
  if (!target.ok) return target.response;

  const parsed = await readJsonBody(request, {
    maxSize: maxRequestSize,
    tooLargeMessage: "The resume data is too large.",
    invalidMessage: "The request body must contain valid JSON.",
  });
  if (!parsed.ok) return parsed.response;

  const resume = normalizeResume(parsed.body);
  if (!resume) {
    return NextResponse.json(
      { error: "The resume data is invalid." },
      { status: 400 },
    );
  }

  try {
    const saved = await saveResumeVersion(target.userId, target.id, resume);
    return saved ? NextResponse.json({ ok: true }) : notFound();
  } catch (error) {
    return databaseError("save", error);
  }
}

/** Renames a resume version. */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const target = await resolveRequest(context);
  if (!target.ok) return target.response;

  const parsed = await readJsonBody(request, {
    maxSize: 10_000,
    tooLargeMessage: "The resume details are too large.",
    invalidMessage: "The request body must contain valid JSON.",
  });
  if (!parsed.ok) return parsed.response;

  const title = isRecord(parsed.body)
    ? normalizeResumeTitle(parsed.body.title)
    : null;
  if (!title) {
    return NextResponse.json(
      { error: "Enter a resume title of up to 80 characters." },
      { status: 400 },
    );
  }

  try {
    const renamed = await renameResumeVersion(target.userId, target.id, title);
    return renamed ? NextResponse.json({ ok: true, title }) : notFound();
  } catch (error) {
    return databaseError("rename", error);
  }
}

/** Deletes a resume version (never the last one). */
export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const target = await resolveRequest(context);
  if (!target.ok) return target.response;

  try {
    const deleted = await deleteResumeVersion(target.userId, target.id);
    return deleted ? NextResponse.json({ ok: true }) : notFound();
  } catch (error) {
    if (error instanceof ResumeServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return databaseError("delete", error);
  }
}
