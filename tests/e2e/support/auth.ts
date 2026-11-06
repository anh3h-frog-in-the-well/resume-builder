import type { BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { e2eAuthSecret, e2eHost, e2eUser } from "./env";

/** Cookie name Auth.js uses for the JWT session over plain HTTP. */
export const sessionCookieName = "authjs.session-token";

type SessionUser = typeof e2eUser;

/**
 * Mints a JWT that the app's own Auth.js configuration accepts (same secret,
 * same cookie salt). This lets the proxy/middleware treat the browser as signed
 * in without ever calling the credentials provider or the database.
 */
export async function createSessionCookie(user: SessionUser = e2eUser) {
  const maxAge = 60 * 60;
  const token = await encode({
    // `accountId` is what the app's jwt callback stores at sign-in; carrying
    // it here means the server never has to look the account up.
    token: { sub: user.id, accountId: user.id, name: user.name, email: user.email },
    secret: e2eAuthSecret,
    salt: sessionCookieName,
    maxAge,
  });

  return {
    name: sessionCookieName,
    value: token,
    domain: e2eHost,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
    expires: Math.floor(Date.now() / 1000) + maxAge,
  };
}

export async function signIn(context: BrowserContext, user?: SessionUser) {
  await context.addCookies([await createSessionCookie(user)]);
}

export async function signOut(context: BrowserContext) {
  await context.clearCookies({ name: sessionCookieName });
}
