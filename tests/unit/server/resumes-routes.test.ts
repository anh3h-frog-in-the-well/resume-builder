// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as list, POST as create } from "../../../src/app/api/resumes/route";
import {
  DELETE as remove,
  GET as load,
  PATCH as rename,
  PUT as save,
} from "../../../src/app/api/resumes/[id]/route";
import { ResumeServiceError } from "../../../src/service/resume-service";
import { createResume } from "../fixtures/resume";

const service = vi.hoisted(() => ({
  listResumeVersions: vi.fn(),
  createResumeVersion: vi.fn(),
  getResumeVersion: vi.fn(),
  saveResumeVersion: vi.fn(),
  renameResumeVersion: vi.fn(),
  deleteResumeVersion: vi.fn(),
}));
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("../../../src/auth", () => ({ auth }));
vi.mock("../../../src/service/resume-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/service/resume-service")>();
  return { ...actual, ...service };
});

const versionId = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const context = (id = versionId) => ({ params: Promise.resolve({ id }) });
const summary = { id: versionId, title: "My resume", updatedAt: "2024-01-01T00:00:00.000Z" };

function request(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/resumes/${versionId}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("resume version routes", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.mockResolvedValue({ user: { id: "user-1" } });
  });

  describe("GET /api/resumes", () => {
    it("requires authentication", async () => {
      auth.mockResolvedValue(null);

      const response = await list();

      expect(response.status).toBe(401);
      expect(service.listResumeVersions).not.toHaveBeenCalled();
    });

    it("returns the account's versions", async () => {
      service.listResumeVersions.mockResolvedValue({ resumes: [summary], isNew: true });

      const response = await list();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ resumes: [summary], isNew: true });
      expect(service.listResumeVersions).toHaveBeenCalledWith("user-1");
    });

    it("returns 503 when the database fails", async () => {
      service.listResumeVersions.mockRejectedValue(new Error("ECONNREFUSED"));

      const response = await list();

      expect(response.status).toBe(503);
    });
  });

  describe("POST /api/resumes", () => {
    it("requires authentication", async () => {
      auth.mockResolvedValue({ user: {} });

      const response = await create(request("POST", {}));

      expect(response.status).toBe(401);
    });

    it("creates a blank untitled resume by default", async () => {
      service.createResumeVersion.mockResolvedValue(summary);

      const response = await create(request("POST", {}));

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual(summary);
      expect(service.createResumeVersion).toHaveBeenCalledWith(
        "user-1",
        "Untitled resume",
        expect.objectContaining({ name: "", experience: [], template: "modern" }),
      );
    });

    it("creates from a title and resume", async () => {
      service.createResumeVersion.mockResolvedValue(summary);
      const resume = createResume({ name: "Copy" });

      await create(request("POST", { title: "  Frontend  roles ", resume }));

      expect(service.createResumeVersion).toHaveBeenCalledWith("user-1", "Frontend roles", resume);
    });

    it.each([
      ["a non-object body", "[]", "The request body is invalid."],
      ["malformed JSON", "{ nope", "The request body must contain valid JSON."],
      ["an empty title", { title: "   " }, "Enter a resume title of up to 80 characters."],
      ["an over-long title", { title: "x".repeat(81) }, "Enter a resume title of up to 80 characters."],
      ["an invalid resume", { resume: { name: 1 } }, "The resume data is invalid."],
    ])("rejects %s", async (_label, body, error) => {
      const response = await create(request("POST", body));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error });
      expect(service.createResumeVersion).not.toHaveBeenCalled();
    });

    it("returns 400 when the body cannot be read", async () => {
      const broken = request("POST", {});
      vi.spyOn(broken, "text").mockRejectedValue(new Error("stream closed"));

      const response = await create(broken);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Unable to read the request body." });
    });

    it("rejects oversized payloads", async () => {
      const response = await create(
        request("POST", {}, { "content-length": String(1_000_001) }),
      );

      expect(response.status).toBe(413);
    });

    it("passes through service errors such as the version limit", async () => {
      service.createResumeVersion.mockRejectedValue(
        new ResumeServiceError("You can keep up to 10 resumes.", 409),
      );

      const response = await create(request("POST", {}));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: "You can keep up to 10 resumes." });
    });

    it("returns 503 for database failures", async () => {
      service.createResumeVersion.mockRejectedValue(new Error("deadlock"));

      const response = await create(request("POST", {}));

      expect(response.status).toBe(503);
    });
  });

  describe("/api/resumes/[id]", () => {
    it("requires authentication for every method", async () => {
      auth.mockResolvedValue(null);

      expect((await load(request("GET"), context())).status).toBe(401);
      expect((await save(request("PUT", createResume()), context())).status).toBe(401);
      expect((await rename(request("PATCH", { title: "x" }), context())).status).toBe(401);
      expect((await remove(request("DELETE"), context())).status).toBe(401);
    });

    it("treats a malformed id as not found", async () => {
      const response = await load(request("GET"), context("not-a-uuid"));

      expect(response.status).toBe(404);
      expect(service.getResumeVersion).not.toHaveBeenCalled();
    });

    it("loads a version", async () => {
      const version = { ...summary, resume: createResume() };
      service.getResumeVersion.mockResolvedValue(version);

      const response = await load(request("GET"), context());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(version);
      expect(service.getResumeVersion).toHaveBeenCalledWith("user-1", versionId);
    });

    it("returns 404 for an unknown version", async () => {
      service.getResumeVersion.mockResolvedValue(null);

      const response = await load(request("GET"), context());

      expect(response.status).toBe(404);
    });

    it("returns 503 when loading fails", async () => {
      service.getResumeVersion.mockRejectedValue(new Error("down"));

      expect((await load(request("GET"), context())).status).toBe(503);
    });

    it("saves a normalized resume", async () => {
      service.saveResumeVersion.mockResolvedValue(true);
      const resume = createResume();

      const response = await save(request("PUT", { ...resume, extra: true }), context());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(service.saveResumeVersion).toHaveBeenCalledWith("user-1", versionId, resume);
    });

    it("rejects invalid resume data on save", async () => {
      const response = await save(request("PUT", { name: "x" }), context());

      expect(response.status).toBe(400);
      expect(service.saveResumeVersion).not.toHaveBeenCalled();
    });

    it("rejects oversized saves", async () => {
      const response = await save(
        request("PUT", createResume(), { "content-length": String(1_000_001) }),
        context(),
      );

      expect(response.status).toBe(413);
    });

    it("returns 404 when saving an unknown version", async () => {
      service.saveResumeVersion.mockResolvedValue(false);

      expect((await save(request("PUT", createResume()), context())).status).toBe(404);
    });

    it("returns 503 when saving fails", async () => {
      service.saveResumeVersion.mockRejectedValue(new Error("down"));

      expect((await save(request("PUT", createResume()), context())).status).toBe(503);
    });

    it("renames a version", async () => {
      service.renameResumeVersion.mockResolvedValue(true);

      const response = await rename(request("PATCH", { title: " New  title " }), context());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, title: "New title" });
      expect(service.renameResumeVersion).toHaveBeenCalledWith("user-1", versionId, "New title");
    });

    it.each([
      ["a missing title", {}],
      ["a blank title", { title: " " }],
      ["a non-object body", "[]"],
    ])("rejects a rename with %s", async (_label, body) => {
      const response = await rename(request("PATCH", body), context());

      expect(response.status).toBe(400);
      expect(service.renameResumeVersion).not.toHaveBeenCalled();
    });

    it("returns 404 when renaming an unknown version", async () => {
      service.renameResumeVersion.mockResolvedValue(false);

      expect((await rename(request("PATCH", { title: "x" }), context())).status).toBe(404);
    });

    it("returns 503 when renaming fails", async () => {
      service.renameResumeVersion.mockRejectedValue(new Error("down"));

      expect((await rename(request("PATCH", { title: "x" }), context())).status).toBe(503);
    });

    it("deletes a version", async () => {
      service.deleteResumeVersion.mockResolvedValue(true);

      const response = await remove(request("DELETE"), context());

      expect(response.status).toBe(200);
      expect(service.deleteResumeVersion).toHaveBeenCalledWith("user-1", versionId);
    });

    it("returns 404 when deleting an unknown version", async () => {
      service.deleteResumeVersion.mockResolvedValue(false);

      expect((await remove(request("DELETE"), context())).status).toBe(404);
    });

    it("refuses to delete the last version", async () => {
      service.deleteResumeVersion.mockRejectedValue(
        new ResumeServiceError("Keep at least one resume.", 409),
      );

      const response = await remove(request("DELETE"), context());

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: "Keep at least one resume." });
    });

    it("returns 503 when deleting fails", async () => {
      service.deleteResumeVersion.mockRejectedValue(new Error("down"));

      expect((await remove(request("DELETE"), context())).status).toBe(503);
    });
  });
});
