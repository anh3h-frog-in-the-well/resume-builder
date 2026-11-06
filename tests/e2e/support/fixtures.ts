import { randomUUID } from "node:crypto";
import { test as base, expect, type Page, type Route } from "@playwright/test";
import type { Resume, ResumeVersion } from "../../../src/interface/resume";
import { sampleResume } from "./resume";

type FakeVersion = ResumeVersion;

type ResumeApiState = {
  /** Versions the fake server holds, in creation order. */
  versions: FakeVersion[];
  /** Reported by GET /api/resumes when the sample resume was just created. */
  isNew: boolean;
  /** Force a status for GET /api/resumes (e.g. 503). */
  listStatus?: number;
  /** Force a status for GET /api/resumes/:id (e.g. 503). */
  getStatus?: number;
  /** Force a status for PUT /api/resumes/:id (e.g. 503). */
  putStatus?: number;
  /** Force a status for POST /api/resumes (e.g. 503). */
  createStatus?: number;
};

export type ResumeApi = {
  /** Replace the fake server state. Call before navigating to the editor. */
  reset: (state: Partial<ResumeApiState>) => void;
  /** Current versions held by the fake server. */
  versions: () => FakeVersion[];
  /** Bodies of every PUT /api/resumes/:id received so far, with the target id. */
  readonly saved: { id: string; resume: Resume }[];
  /** The most recently saved resume content (any version). */
  lastSaved: () => Resume | undefined;
  /** Number of GET /api/resumes (list) requests served. */
  readonly loads: number;
};

export function fakeVersion(
  overrides: Partial<FakeVersion> = {},
  resumeOverrides: Partial<Resume> = {},
): FakeVersion {
  return {
    id: randomUUID(),
    title: "My resume",
    updatedAt: "2024-01-01T00:00:00.000Z",
    resume: sampleResume(resumeOverrides),
    ...overrides,
  };
}

/**
 * In-browser fake for the resume versions API. The real route handlers need
 * PostgreSQL, so requests are intercepted before they leave the page.
 */
async function installResumeApi(page: Page): Promise<ResumeApi> {
  const state: ResumeApiState = { versions: [fakeVersion()], isNew: false };
  const saved: { id: string; resume: Resume }[] = [];
  let loads = 0;

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  const summary = ({ id, title, updatedAt }: FakeVersion) => ({ id, title, updatedAt });
  const notFound = (route: Route) => json(route, { error: "This resume was not found." }, 404);

  await page.route("**/api/resumes", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      loads += 1;
      if (state.listStatus) {
        return json(route, { error: "Unable to load your resumes from the database." }, state.listStatus);
      }
      return json(route, { resumes: state.versions.map(summary), isNew: state.isNew });
    }
    if (method === "POST") {
      if (state.createStatus) {
        return json(route, { error: "Unable to create the resume in the database." }, state.createStatus);
      }
      if (state.versions.length >= 10) {
        return json(route, { error: "You can keep up to 10 resumes. Delete one to create another." }, 409);
      }
      const body = route.request().postDataJSON() as { title?: string; resume?: Resume };
      const created = fakeVersion({
        title: body.title ?? "Untitled resume",
        updatedAt: new Date().toISOString(),
        resume: body.resume ?? sampleResume(),
      });
      state.versions.push(created);
      return json(route, summary(created), 201);
    }
    return route.fulfill({ status: 405, body: "" });
  });

  await page.route("**/api/resumes/*", async (route) => {
    const method = route.request().method();
    const id = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const version = state.versions.find((entry) => entry.id === id);

    if (method === "GET") {
      if (state.getStatus) {
        return json(route, { error: "Unable to load the resume in the database." }, state.getStatus);
      }
      return version ? json(route, version) : notFound(route);
    }
    if (method === "PUT") {
      if (state.putStatus) {
        return json(route, { error: "Unable to save the resume in the database." }, state.putStatus);
      }
      if (!version) return notFound(route);
      const resume = route.request().postDataJSON() as Resume;
      saved.push({ id, resume });
      version.resume = resume;
      version.updatedAt = new Date().toISOString();
      return json(route, { ok: true });
    }
    if (method === "PATCH") {
      if (!version) return notFound(route);
      const body = route.request().postDataJSON() as { title?: string };
      if (!body.title?.trim()) {
        return json(route, { error: "Enter a resume title of up to 80 characters." }, 400);
      }
      version.title = body.title.trim();
      return json(route, { ok: true, title: version.title });
    }
    if (method === "DELETE") {
      if (!version) return notFound(route);
      if (state.versions.length === 1) {
        return json(route, { error: "Keep at least one resume. Create another one before deleting this one." }, 409);
      }
      state.versions = state.versions.filter((entry) => entry.id !== id);
      return json(route, { ok: true });
    }
    return route.fulfill({ status: 405, body: "" });
  });

  return {
    reset(next) {
      Object.assign(
        state,
        { listStatus: undefined, getStatus: undefined, putStatus: undefined, createStatus: undefined },
        next,
      );
    },
    versions: () => state.versions,
    saved,
    lastSaved: () => saved.at(-1)?.resume,
    get loads() {
      return loads;
    },
  };
}

type PolishKind = "summary" | "experience";

export type PolishApi = {
  /** Respond successfully with the given text (after an optional delay). */
  succeed: (kind: PolishKind, text: string, delayMs?: number) => Promise<void>;
  /** Respond with an error payload and status. */
  fail: (kind: PolishKind, message: string, status?: number) => Promise<void>;
  /** Request bodies received per kind. */
  readonly requests: Record<PolishKind, unknown[]>;
};

async function installPolishApi(page: Page): Promise<PolishApi> {
  const requests: Record<PolishKind, unknown[]> = { summary: [], experience: [] };
  const field: Record<PolishKind, string> = {
    summary: "summary",
    experience: "description",
  };
  const url = (kind: PolishKind) => `**/api/polish-${kind}`;

  // Default: never let a polish request reach the real Ollama-backed handler.
  await page.route("**/api/polish-*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Polishing is not mocked in this test." }),
    }),
  );

  return {
    requests,
    async succeed(kind, text, delayMs = 0) {
      await page.route(url(kind), async (route) => {
        requests[kind].push(route.request().postDataJSON());
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ [field[kind]]: text }),
        });
      });
    },
    async fail(kind, message, status = 503) {
      await page.route(url(kind), async (route) => {
        requests[kind].push(route.request().postDataJSON());
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: message }),
        });
      });
    },
  };
}

/**
 * Replaces `window.print` with a counter so "Save as PDF" and "Finish resume"
 * can be asserted without a native dialog.
 */
async function installPrintSpy(page: Page) {
  await page.addInitScript(() => {
    const spyWindow = window as Window & { __printCalls?: number };
    spyWindow.__printCalls = 0;
    window.print = () => {
      spyWindow.__printCalls = (spyWindow.__printCalls ?? 0) + 1;
    };
  });
  return {
    calls: () =>
      page.evaluate(() => (window as Window & { __printCalls?: number }).__printCalls ?? 0),
  };
}

/**
 * All fakes are `auto` fixtures: they are installed for every test, whether or
 * not the test references them, so no request can slip through to the real
 * database-backed API handlers.
 */
export const test = base.extend<{
  resumeApi: ResumeApi;
  polishApi: PolishApi;
  printSpy: { calls: () => Promise<number> };
}>({
  resumeApi: [
    async ({ page }, use) => {
      await use(await installResumeApi(page));
    },
    { auto: true },
  ],
  polishApi: [
    async ({ page }, use) => {
      await use(await installPolishApi(page));
    },
    { auto: true },
  ],
  printSpy: [
    async ({ page }, use) => {
      await use(await installPrintSpy(page));
    },
    { auto: true },
  ],
});

export { expect };
