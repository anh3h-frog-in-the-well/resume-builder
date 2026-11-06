// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateLegacyDrafts } from "../../../src/service/legacy-migration";
import {
  getResumeVersion,
  listResumeVersions,
} from "../../../src/service/resume-service";
import { createFakePrisma } from "../fixtures/fake-prisma";
import { createExperience, createResume } from "../fixtures/resume";

const { getPrismaClient } = vi.hoisted(() => ({ getPrismaClient: vi.fn() }));
vi.mock("../../../src/lib/prisma", () => ({ getPrismaClient }));

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("migrateLegacyDrafts", () => {
  let fake: ReturnType<typeof createFakePrisma>;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    fake = createFakePrisma();
    logger = createLogger();
    getPrismaClient.mockResolvedValue(fake.prisma);
  });

  it("does nothing once the legacy tables are gone", async () => {
    const result = await migrateLegacyDrafts(fake.prisma, logger);

    expect(result).toEqual({ ran: false, migrated: 0, failed: 0, dropped: false });
    expect(fake.db.log).toEqual([
      expect.stringContaining('SELECT table_name AS "TABLE_NAME" FROM information_schema.tables'),
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("moves every draft into a version, verifies it and drops the legacy tables", async () => {
    const first = createResume({ name: "First Person", experience: [] });
    const second = createResume({ name: "Second Person", experience: [] });
    fake.seedLegacyDraft("account-1", first, [
      { position: 1, company: "Later Co", role: "Lead", from_month: "2021-01", to_month: "", description: "Later." },
      { position: 0, company: "Earlier Co", role: "Dev", from_month: "2018-01", to_month: "2020-12", description: "Earlier." },
    ]);
    fake.seedLegacyDraft("account-2", second);

    const result = await migrateLegacyDrafts(fake.prisma, logger);

    expect(result).toEqual({ ran: true, migrated: 2, failed: 0, dropped: true });
    expect(fake.db.legacyTables).toEqual({ drafts: false, experiences: false });
    expect(fake.db.transactions).toMatchObject({ begun: 2, committed: 2, rolledBack: 0 });

    const one = await listResumeVersions("account-1");
    expect(one.isNew).toBe(false);
    expect(one.resumes.map((version) => version.title)).toEqual(["My resume"]);
    const migratedOne = await getResumeVersion("account-1", one.resumes[0].id);
    expect(migratedOne?.resume).toEqual({
      ...first,
      experience: [
        { company: "Earlier Co", role: "Dev", from: "2018-01", to: "2020-12", description: "Earlier." },
        { company: "Later Co", role: "Lead", from: "2021-01", to: "", description: "Later." },
      ],
    });

    const two = await listResumeVersions("account-2");
    expect(two.isNew).toBe(false);
    const migratedTwo = await getResumeVersion("account-2", two.resumes[0].id);
    expect(migratedTwo?.resume).toEqual(second);

    expect(logger.info).toHaveBeenCalledWith(
      "Migrated 2 legacy resume draft(s) to resume versions and dropped the legacy tables.",
    );
  });

  it("locks each draft while it is being moved", async () => {
    fake.seedLegacyDraft("account-1", createResume());

    await migrateLegacyDrafts(fake.prisma, logger);

    expect(fake.db.log).toContain(
      "SELECT resume_data FROM resume_drafts WHERE session_id = ? FOR UPDATE",
    );
  });

  it("reads very old drafts whose experience is still stored inline", async () => {
    const inline = createResume({ experience: [createExperience({ company: "Inline Co" })] });
    fake.seedLegacyDraft("account-1", inline);

    await migrateLegacyDrafts(fake.prisma, logger);

    const { resumes } = await listResumeVersions("account-1");
    const migrated = await getResumeVersion("account-1", resumes[0].id);
    expect(migrated?.resume).toEqual(inline);
  });

  it("adds the migrated draft next to versions the account already has", async () => {
    await listResumeVersions("account-1"); // sample resume already created
    fake.seedLegacyDraft("account-1", createResume({ name: "Legacy Person" }));

    const result = await migrateLegacyDrafts(fake.prisma, logger);

    expect(result.migrated).toBe(1);
    const { resumes } = await listResumeVersions("account-1");
    expect(resumes).toHaveLength(2);
    const migrated = await getResumeVersion("account-1", resumes[1].id);
    expect(migrated?.resume.name).toBe("Legacy Person");
  });

  it("keeps drafts that cannot be migrated and leaves the tables in place", async () => {
    fake.seedLegacyDraft("good-account", createResume({ name: "Good" }));
    fake.seedLegacyDraft("broken-account", "{ not json");
    fake.seedLegacyDraft("invalid-account", { name: 42 });

    const result = await migrateLegacyDrafts(fake.prisma, logger);

    expect(result).toEqual({ ran: true, migrated: 1, failed: 2, dropped: false });
    expect(fake.db.legacyTables).toEqual({ drafts: true, experiences: true });
    expect(fake.db.legacyDrafts.map((row) => row.session_id)).toEqual([
      "broken-account",
      "invalid-account",
    ]);
    // Nothing half-migrated was left behind for the failed drafts.
    expect(fake.db.versions.map((row) => row.account_id)).toEqual(["good-account"]);
    expect(fake.db.transactions).toMatchObject({ committed: 1, rolledBack: 2 });
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("broken-account"),
      expect.any(Error),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("2 remain in resume_drafts (2 failed)"),
    );
  });

  it("rolls back and keeps the draft when the copy does not match the source", async () => {
    fake.seedLegacyDraft("account-1", createResume({ name: "Original" }));
    // Simulate a write that silently loses the experience rows.
    fake.db.loseExperienceWrites = true;

    const result = await migrateLegacyDrafts(fake.prisma, logger);

    expect(result).toEqual({ ran: true, migrated: 0, failed: 1, dropped: false });
    expect(fake.db.versions).toHaveLength(0);
    expect(fake.db.legacyDrafts).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("account-1"),
      expect.objectContaining({
        message: "The migrated resume does not match the legacy draft.",
      }),
    );
  });

  it("skips drafts another instance migrated in the meantime", async () => {
    fake.seedLegacyDraft("account-1", createResume());
    // The key scan sees the draft, but it is gone by the time it is locked.
    fake.interceptQueryRaw((query) =>
      query.includes("FOR UPDATE") ? [] : undefined,
    );

    const result = await migrateLegacyDrafts(fake.prisma, logger);

    expect(result.migrated).toBe(0);
    expect(result.failed).toBe(0);
    expect(fake.db.versions).toHaveLength(0);
  });

  it("is safe to run again after a partial failure", async () => {
    fake.seedLegacyDraft("good-account", createResume({ name: "Good" }));
    fake.seedLegacyDraft("broken-account", "{ not json");
    await migrateLegacyDrafts(fake.prisma, logger);

    // The broken draft gets repaired out of band, then the app restarts.
    const broken = fake.db.legacyDrafts.find((row) => row.session_id === "broken-account");
    if (broken) broken.resume_data = JSON.stringify(createResume({ name: "Repaired" }));

    const result = await migrateLegacyDrafts(fake.prisma, logger);

    expect(result).toEqual({ ran: true, migrated: 1, failed: 0, dropped: true });
    expect(fake.db.versions.map((row) => row.account_id).sort()).toEqual([
      "broken-account",
      "good-account",
    ]);
    expect(fake.db.legacyTables).toEqual({ drafts: false, experiences: false });
  });

  it("drops an orphaned experiences table", async () => {
    fake.db.legacyTables = { drafts: false, experiences: true };

    const result = await migrateLegacyDrafts(fake.prisma, logger);

    expect(result).toEqual({ ran: false, migrated: 0, failed: 0, dropped: true });
    expect(fake.db.legacyTables.experiences).toBe(false);
  });
});
