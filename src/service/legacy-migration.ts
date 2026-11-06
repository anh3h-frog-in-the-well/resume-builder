import type { Prisma, PrismaClient } from "@prisma/client";
import { defaultResumeTitle, normalizeResume } from "../util/resume-helper";
import {
  insertVersion,
  mapExperienceRows,
  parseStoredResumeData,
  selectVersionResume,
  type DatabaseClient,
} from "./resume-storage";

/**
 * One-off migration from the pre-versioning schema (`resume_drafts` +
 * `resume_experiences`, one draft per account) to `resume_versions`.
 *
 * Each draft is copied and verified in a transaction before it is removed.
 * Invalid drafts are logged and left in place for a later retry.
 */
type TableRow = { TABLE_NAME: string };
type LegacyDraftKeyRow = { session_id: string };
type LegacyDraftRow = { resume_data: unknown };
type LegacyExperienceRow = {
  company: string;
  role: string;
  from_month: string;
  to_month: string;
  description: string;
};

export type LegacyMigrationResult = {
  /** False when the legacy tables no longer exist and nothing had to run. */
  ran: boolean;
  migrated: number;
  failed: number;
  /** True when the legacy tables were dropped at the end of this run. */
  dropped: boolean;
};

type Logger = Pick<Console, "info" | "warn" | "error">;

async function legacyTablesPresent(prisma: DatabaseClient) {
  const rows = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name AS "TABLE_NAME"
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN ('resume_drafts', 'resume_experiences')
  `;
  const names = new Set(rows.map((row) => row.TABLE_NAME));
  return {
    drafts: names.has("resume_drafts"),
    experiences: names.has("resume_experiences"),
  };
}

/**
 * Builds a legacy resume. Very old drafts kept their experience inside JSON;
 * newer ones moved it to `resume_experiences`.
 */
function buildLegacyResume(
  storedData: unknown,
  experienceRows: LegacyExperienceRow[],
) {
  const data = parseStoredResumeData(storedData);
  const resume = normalizeResume({
    ...data,
    experience:
      experienceRows.length > 0
        ? mapExperienceRows(
            experienceRows.map((row) => ({
              company: row.company,
              role: row.role,
              fromMonth: row.from_month,
              toMonth: row.to_month,
              description: row.description,
            })),
          )
        : data.experience,
  });
  if (!resume) {
    throw new Error("The legacy resume data is invalid.");
  }
  return resume;
}

/**
 * Migrates one draft. Returns false when another instance already migrated it.
 */
async function migrateDraft(
  connection: Prisma.TransactionClient,
  accountId: string,
) {
  const draftRows = await connection.$queryRaw<LegacyDraftRow[]>`
    SELECT resume_data
    FROM resume_drafts
    WHERE session_id = ${accountId}
    FOR UPDATE
  `;
  const draftRow = draftRows[0];
  if (!draftRow) return false;

  const experienceRows =
    await connection.$queryRaw<LegacyExperienceRow[]>`
      SELECT company, role, from_month, to_month, description
      FROM resume_experiences
      WHERE session_id = ${accountId}
      ORDER BY position
    `;
  const source = buildLegacyResume(draftRow.resume_data, experienceRows);
  const versionId = await insertVersion(
    connection,
    accountId,
    defaultResumeTitle,
    source,
  );

  const copy = await selectVersionResume(connection, accountId, versionId);
  if (!copy || JSON.stringify(copy.resume) !== JSON.stringify(source)) {
    throw new Error("The migrated resume does not match the legacy draft.");
  }

  await connection.$executeRaw`
    DELETE FROM resume_drafts WHERE session_id = ${accountId}
  `;
  return true;
}

export async function migrateLegacyDrafts(
  prisma: PrismaClient,
  logger: Logger = console,
): Promise<LegacyMigrationResult> {
  const tables = await legacyTablesPresent(prisma);
  if (!tables.drafts) {
    if (tables.experiences) {
      await prisma.$executeRaw`DROP TABLE IF EXISTS resume_experiences`;
      logger.info("Dropped the orphaned legacy resume_experiences table.");
    }
    return { ran: false, migrated: 0, failed: 0, dropped: tables.experiences };
  }

  const keyRows = await prisma.$queryRaw<LegacyDraftKeyRow[]>`
    SELECT session_id
    FROM resume_drafts
    ORDER BY created_at, session_id
  `;

  let migrated = 0;
  let failed = 0;
  for (const { session_id: accountId } of keyRows) {
    try {
      const didMigrate = await prisma.$transaction((transaction) =>
        migrateDraft(transaction, accountId),
      );
      if (didMigrate) migrated += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        `Unable to migrate the legacy resume draft of account ${accountId}; it was left in resume_drafts.`,
        error,
      );
    }
  }

  const countRows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*) AS total FROM resume_drafts
  `;
  const remaining = Number(countRows[0]?.total ?? 0);

  let dropped = false;
  if (remaining === 0 && failed === 0) {
    await prisma.$executeRaw`DROP TABLE IF EXISTS resume_experiences`;
    await prisma.$executeRaw`DROP TABLE IF EXISTS resume_drafts`;
    dropped = true;
    logger.info(
      `Migrated ${migrated} legacy resume draft(s) to resume versions and dropped the legacy tables.`,
    );
  } else {
    logger.warn(
      `Migrated ${migrated} legacy resume draft(s); ${remaining} remain in resume_drafts (${failed} failed). The legacy tables were kept and the migration will run again on the next start.`,
    );
  }

  return { ran: true, migrated, failed, dropped };
}
