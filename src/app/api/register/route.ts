import { NextResponse } from "next/server";
import {
  createPasswordUser,
  findAuthUserByEmail,
} from "../../../service/auth-service";
import { hashPassword } from "../../../lib/password";

const maxRequestSize = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: "Registration request origin is invalid." },
      { status: 403 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxRequestSize) {
    return NextResponse.json(
      { error: "Registration details are too large." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > maxRequestSize) {
      return NextResponse.json(
        { error: "Registration details are too large." },
        { status: 413 },
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Registration details must be valid JSON." },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Registration details are invalid." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (
    name.length < 2 ||
    name.length > 100 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 8 ||
    password.length > 128
  ) {
    return NextResponse.json(
      {
        error:
          "Enter a valid name and email, and a password between 8 and 128 characters.",
      },
      { status: 400 },
    );
  }

  try {
    if (await findAuthUserByEmail(email)) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    await createPasswordUser(email, name, await hashPassword(password));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    console.error("Unable to register user.", error);
    return NextResponse.json(
      { error: "Unable to create your account right now." },
      { status: 503 },
    );
  }
}
