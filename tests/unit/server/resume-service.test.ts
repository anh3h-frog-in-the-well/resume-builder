// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Resume } from "../../../src/interface/resume";
import {
  createResumeVersion,
  deleteResumeVersion,
  getResumeVersion,
  listResumeVersions,
  renameResumeVersion,
  ResumeServiceError,
  saveResumeVersion,
} from "../../../src/service/resume-service";
import { createFakePrisma } from "../fixtures/fake-prisma";
import { createExperience, createResume } from "../fixtures/resume";

const { getPrismaClient } = vi.hoisted(() => ({ getPrismaClient: vi.fn() }));
vi.mock("../../../src/lib/prisma", () => ({ getPrismaClient }));

const account = "account-1";
const otherAccount = "account-2";

describe("resume-service", () => {
  let fake: ReturnType<typeof createFakePrisma>;

  beforeEach(() => {
    fake = createFakePrisma();
    getPrismaClient.mockResolvedValue(fake.prisma);
  });

  describe("listResumeVersions", () => {
    it("creates the sample resume for a brand-new account", async () => {
      const result = await listResumeVersions(account);

      expect(result.isNew).toBe(true);
      expect(result.resumes).toHaveLength(1);
      expect(result.resumes[0]).toMatchObject({ title: "My resume" });
      expect(result.resumes[0].updatedAt).toMatch(/^2024-01-01T/);

      const stored = await getResumeVersion(account, result.resumes[0].id);
      expect(stored?.resume.name).toBe("Max Mustermann");
      expect(stored?.resume.experience).toHaveLength(1);
      expect(fake.db.transactions.committed).toBeGreaterThan(0);
    });

    it("lists existing versions in creation order and only for that account", async () => {
      await listResumeVersions(account);
      await createResumeVersion(account, "Second", createResume());
      await createResumeVersion(otherAccount, "Theirs", createResume());

      const result = await listResumeVersions(account);

      expect(result.isNew).toBe(false);
      expect(result.resumes.map((version) => version.title)).toEqual(["My resume", "Second"]);
    });
  });

  describe("createResumeVersion", () => {
    it("stores the resume with its experience rows", async () => {
      const resume = createResume({
        experience: [createExperience({ company: "A" }), createExperience({ company: "B" })],
      });

      const created = await createResumeVersion(account, "Frontend", resume);

      expect(created.title).toBe("Frontend");
      const row = fake.db.versions.find((entry) => entry.id === created.id);
      expect(row?.account_id).toBe(account);
      // Experience lives in its own table, not in the JSON blob.
      expect(JSON.parse(row?.resume_data ?? "{}").experience).toEqual([]);
      expect(fake.db.experiences.filter((entry) => entry.resume_id === created.id)).toHaveLength(2);
      await expect(getResumeVersion(account, created.id)).resolves.toMatchObject({ resume });
    });

    it("enforces the per-account limit", async () => {
      for (let index = 0; index < 10; index += 1) {
        await createResumeVersion(account, `Resume ${index + 1}`, createResume());
      }

      const failure = createResumeVersion(account, "One too many", createResume());
      await expect(failure).rejects.toBeInstanceOf(ResumeServiceError);
      await expect(failure).rejects.toMatchObject({ status: 409 });
      expect(fake.db.versions).toHaveLength(10);

      // Other accounts are unaffected by the limit.
      await expect(createResumeVersion(otherAccount, "Theirs", createResume())).resolves.toBeDefined();
    });
  });

  describe("getResumeVersion", () => {
    it("rejects stored data that is not valid JSON", async () => {
      const created = await createResumeVersion(account, "Mine", createResume());
      const row = fake.db.versions.find((entry) => entry.id === created.id);
      if (row) row.resume_data = "{ not json";

      await expect(getResumeVersion(account, created.id)).rejects.toThrow(
        "The stored resume data is not valid JSON.",
      );
      expect(fake.db.transactions.rolledBack).toBe(1);
    });

    it("returns null for unknown ids and other accounts", async () => {
      const created = await createResumeVersion(account, "Mine", createResume());

      await expect(getResumeVersion(account, "missing")).resolves.toBeNull();
      await expect(getResumeVersion(otherAccount, created.id)).resolves.toBeNull();
    });

    it("rejects corrupt stored data", async () => {
      const created = await createResumeVersion(account, "Mine", createResume());
      const row = fake.db.versions.find((entry) => entry.id === created.id);
      if (row) row.resume_data = JSON.stringify({ name: 1 });

      await expect(getResumeVersion(account, created.id)).rejects.toThrow(
        "The stored resume data is invalid.",
      );
    });

    it("rejects stored data that is not an object", async () => {
      const created = await createResumeVersion(account, "Mine", createResume());
      const row = fake.db.versions.find((entry) => entry.id === created.id);
      if (row) row.resume_data = JSON.stringify([1]);

      await expect(getResumeVersion(account, created.id)).rejects.toThrow(
        "The stored resume data has an invalid format.",
      );
    });
  });

  describe("saveResumeVersion", () => {
    it("replaces the content and experience rows", async () => {
      const created = await createResumeVersion(
        account,
        "Mine",
        createResume({ experience: [createExperience(), createExperience()] }),
      );
      const updated: Resume = createResume({
        name: "Updated",
        experience: [createExperience({ company: "Only one" })],
      });

      await expect(saveResumeVersion(account, created.id, updated)).resolves.toBe(true);

      const stored = await getResumeVersion(account, created.id);
      expect(stored?.resume).toEqual(updated);
      expect(fake.db.experiences.filter((entry) => entry.resume_id === created.id)).toHaveLength(1);
      expect(stored && stored.updatedAt > created.updatedAt).toBe(true);
    });

    it("returns false for unknown versions and other accounts", async () => {
      const created = await createResumeVersion(account, "Mine", createResume());

      await expect(saveResumeVersion(account, "missing", createResume())).resolves.toBe(false);
      await expect(saveResumeVersion(otherAccount, created.id, createResume())).resolves.toBe(false);
    });

    it("rolls back when writing experience fails", async () => {
      const created = await createResumeVersion(account, "Mine", createResume());
      fake.db.failOn = /INSERT INTO resume_version_experiences/;

      await expect(
        saveResumeVersion(account, created.id, createResume({ name: "Broken" })),
      ).rejects.toThrow("Simulated failure");
      expect(fake.db.transactions.rolledBack).toBe(1);
    });
  });

  describe("renameResumeVersion", () => {
    it("renames only the matching version", async () => {
      const created = await createResumeVersion(account, "Old", createResume());

      await expect(renameResumeVersion(account, created.id, "New")).resolves.toBe(true);
      await expect(renameResumeVersion(otherAccount, created.id, "Theirs")).resolves.toBe(false);

      expect((await listResumeVersions(account)).resumes[0].title).toBe("New");
    });
  });

  describe("deleteResumeVersion", () => {
    it("deletes a version and its experience rows", async () => {
      const first = await createResumeVersion(account, "First", createResume());
      const second = await createResumeVersion(
        account,
        "Second",
        createResume({ experience: [createExperience()] }),
      );

      await expect(deleteResumeVersion(account, second.id)).resolves.toBe(true);

      expect((await listResumeVersions(account)).resumes.map((v) => v.id)).toEqual([first.id]);
      expect(fake.db.experiences.filter((entry) => entry.resume_id === second.id)).toHaveLength(0);
    });

    it("refuses to delete the last version", async () => {
      const only = await createResumeVersion(account, "Only", createResume());

      const failure = deleteResumeVersion(account, only.id);
      await expect(failure).rejects.toBeInstanceOf(ResumeServiceError);
      await expect(failure).rejects.toMatchObject({ status: 409 });
      expect(fake.db.versions).toHaveLength(1);
    });

    it("returns false for unknown versions and other accounts", async () => {
      const created = await createResumeVersion(account, "Mine", createResume());
      await createResumeVersion(account, "Other", createResume());

      await expect(deleteResumeVersion(account, "missing")).resolves.toBe(false);
      await expect(deleteResumeVersion(otherAccount, created.id)).resolves.toBe(false);
      expect(fake.db.versions).toHaveLength(2);
    });
  });
});
