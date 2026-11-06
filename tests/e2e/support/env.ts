/**
 * Shared configuration for the end-to-end suite.
 *
 * The e2e tests exercise the real Next.js UI in a browser, but they never talk
 * to PostgreSQL or Ollama:
 *  - every data endpoint (`/api/resume`, `/api/register`, `/api/polish-*`,
 *    `/api/auth/callback/credentials`) is intercepted in the browser with
 *    `page.route`, and
 *  - the server is started with the throw-away settings below. Values set in
 *    the process environment take precedence over `.env.local`, so a
 * developer's real database credentials are never used. PostgreSQL/Ollama point
 *    at closed local ports so any accidental call fails immediately instead of
 *    hanging.
 */
export const e2ePort = Number(process.env.E2E_PORT ?? 3100);
/**
 * Use `localhost` rather than `127.0.0.1`: the Next.js dev server only serves
 * its dev-only resources (HMR, hydration chunks) to allowed origins, and
 * `localhost` is the only one allowed without extra configuration.
 */
export const e2eHost = "localhost";
export const e2eBaseUrl = `http://${e2eHost}:${e2ePort}`;

/** Nothing listens on this port, so accidental backend calls fail fast. */
const closedPort = "1";
const loopback = "127.0.0.1";

export const e2eAuthSecret =
  "resume-builder-e2e-only-secret-0123456789abcdefghijklmnopqrstuvwxyz";

export const e2eUser = {
  id: "e2e-user-id",
  name: "Erin Example",
  email: "erin@example.com",
};

export const e2eServerEnv: Record<string, string> = {
  PORT: String(e2ePort),
  AUTH_SECRET: e2eAuthSecret,
  AUTH_TRUST_HOST: "true",
  AUTH_URL: e2eBaseUrl,
  DATABASE_URL: `postgresql://e2e:e2e@${loopback}:${closedPort}/e2e`,
  OLLAMA_BASE_URL: `http://${loopback}:${closedPort}`,
  OLLAMA_MODEL: "e2e-model",
  AUTH_GOOGLE_ID: "e2e-google-client-id",
  AUTH_GOOGLE_SECRET: "e2e-google-client-secret",
  NEXT_TELEMETRY_DISABLED: "1",
  // Browser console output is captured by Playwright itself; keep the
  // server's terminal output free of the errors the tests provoke on purpose.
  NEXT_BROWSER_LOGS: "off",
};
