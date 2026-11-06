import { request } from "@playwright/test";
import { createSessionCookie } from "./auth";
import { e2eBaseUrl } from "./env";

/**
 * Warms up the routes the tests visit. With `next dev` the first request to a
 * page triggers compilation, which is slow enough to trip test timeouts when
 * many workers hit the server at once.
 */
export default async function globalSetup() {
  const cookie = await createSessionCookie();
  const api = await request.newContext({
    baseURL: e2eBaseUrl,
    timeout: 120_000,
    extraHTTPHeaders: { cookie: `${cookie.name}=${cookie.value}` },
  });

  try {
    for (const path of [
      "/login",
      "/",
      "/api/auth/session",
      "/api/auth/csrf",
      "/api/auth/providers",
    ]) {
      const response = await api.get(path);
      if (!response.ok()) {
        throw new Error(`Warm-up request to ${path} failed with HTTP ${response.status()}.`);
      }
    }
  } finally {
    await api.dispose();
  }
}
