import type { PrismaClient } from "@prisma/client";
import { vi } from "vitest";

type VersionRow = {
  id: string;
  account_id: string;
  title: string;
  resume_data: string;
  created_at: Date;
  updated_at: Date;
};
type ExperienceRow = {
  resume_id: string;
  position: number;
  company: string;
  role: string;
  from_month: string;
  to_month: string;
  description: string;
};
type LegacyDraftRow = {
  session_id: string;
  resume_data: string;
  created_at: Date;
};
type LegacyExperienceRow = Omit<ExperienceRow, "resume_id"> & {
  session_id: string;
};

export function createFakePrisma() {
  const db = {
    versions: [] as VersionRow[],
    experiences: [] as ExperienceRow[],
    legacyDrafts: [] as LegacyDraftRow[],
    legacyExperiences: [] as LegacyExperienceRow[],
    legacyTables: { drafts: false, experiences: false },
    transactions: { begun: 0, committed: 0, rolledBack: 0 },
    failOn: null as RegExp | null,
    loseExperienceWrites: false,
    log: [] as string[],
  };
  let clock = 0;
  const nextDate = () => new Date(Date.UTC(2024, 0, 1, 0, 0, ++clock));
  let queryInterceptor:
    | ((query: string, values: unknown[]) => unknown[] | undefined)
    | undefined;

  const mark = (query: string) => {
    db.log.push(query);
    if (db.failOn?.test(query)) throw new Error(`Simulated failure for: ${query}`);
  };

  const experienceDelegate = {
    findMany: vi.fn(async ({ where }: { where: { resumeId: string } }) =>
      db.experiences
        .filter((row) => row.resume_id === where.resumeId)
        .sort((a, b) => a.position - b.position)
        .map((row) => ({
          company: row.company,
          role: row.role,
          fromMonth: row.from_month,
          toMonth: row.to_month,
          description: row.description,
        })),
    ),
    deleteMany: vi.fn(async ({ where }: { where: { resumeId: string } }) => {
      mark("DELETE FROM resume_version_experiences");
      const before = db.experiences.length;
      db.experiences = db.experiences.filter(
        (row) => row.resume_id !== where.resumeId,
      );
      return { count: before - db.experiences.length };
    }),
    createMany: vi.fn(
      async ({
        data,
      }: {
        data: Array<{
          resumeId: string;
          position: number;
          company: string;
          role: string;
          fromMonth: string;
          toMonth: string;
          description: string;
        }>;
      }) => {
        mark("INSERT INTO resume_version_experiences");
        if (db.loseExperienceWrites) return { count: 0 };
        db.experiences.push(
          ...data.map((row) => ({
            resume_id: row.resumeId,
            position: row.position,
            company: row.company,
            role: row.role,
            from_month: row.fromMonth,
            to_month: row.toMonth,
            description: row.description,
          })),
        );
        return { count: data.length };
      },
    ),
  };

  const versionDelegate = {
    findMany: vi.fn(
      async ({
        where,
        orderBy,
      }: {
        where: { accountId: string };
        orderBy?: Array<Record<string, "asc" | "desc">>;
      }) => {
        mark("SELECT FROM resume_versions");
        const rows = db.versions
          .filter((row) => row.account_id === where.accountId)
          .sort((a, b) => {
            const created = a.created_at.getTime() - b.created_at.getTime();
            return created || a.id.localeCompare(b.id);
          });
        if (orderBy) return rows.map(versionSummary);
        return rows.map(versionSummary);
      },
    ),
    findFirst: vi.fn(async ({ where, include, select }: {
      where: { id: string; accountId: string };
      include?: { experiences?: unknown };
      select?: unknown;
    }) => {
      mark("SELECT FROM resume_versions WHERE id");
      const row = db.versions.find(
        (version) =>
          version.id === where.id && version.account_id === where.accountId,
      );
      if (!row) return null;
      if (include?.experiences) {
        return {
          ...versionSummary(row),
          resumeData: jsonValue(row.resume_data),
          experiences: await experienceDelegate.findMany({
            where: { resumeId: row.id },
          }),
        };
      }
      if (select) return versionSummary(row);
      return row;
    }),
    create: vi.fn(async ({ data }: {
      data: {
        id: string;
        accountId: string;
        title: string;
        resumeData: unknown;
      };
    }) => {
      mark("INSERT INTO resume_versions");
      const now = nextDate();
      db.versions.push({
        id: data.id,
        account_id: data.accountId,
        title: data.title,
        resume_data: JSON.stringify(data.resumeData),
        created_at: now,
        updated_at: now,
      });
      return versionSummary(db.versions[db.versions.length - 1]);
    }),
    count: vi.fn(async ({ where }: { where: { accountId: string } }) =>
      db.versions.filter((row) => row.account_id === where.accountId).length,
    ),
    updateMany: vi.fn(async ({ where, data }: {
      where: { id: string; accountId: string };
      data: { title?: string; resumeData?: unknown };
    }) => {
      mark("UPDATE resume_versions");
      const row = db.versions.find(
        (version) =>
          version.id === where.id && version.account_id === where.accountId,
      );
      if (!row) return { count: 0 };
      if (data.title !== undefined) row.title = data.title;
      if (data.resumeData !== undefined) {
        row.resume_data = JSON.stringify(data.resumeData);
        row.updated_at = nextDate();
      }
      return { count: 1 };
    }),
    deleteMany: vi.fn(async ({ where }: {
      where: { id: string; accountId: string };
    }) => {
      mark("DELETE FROM resume_versions");
      const before = db.versions.length;
      db.versions = db.versions.filter(
        (row) =>
          !(row.id === where.id && row.account_id === where.accountId),
      );
      db.experiences = db.experiences.filter(
        (row) => row.resume_id !== where.id,
      );
      return { count: before - db.versions.length };
    }),
  };

  const accountDelegate = {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
  };

  const prismaObject = {
    account: accountDelegate,
    resumeVersion: versionDelegate,
    resumeVersionExperience: experienceDelegate,
  } as Record<string, unknown>;

  function templateQuery(strings: TemplateStringsArray, values: unknown[]) {
    return { query: strings.join("?").replace(/\s+/g, " ").trim(), values };
  }

  prismaObject.$queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const { query, values: params } = templateQuery(strings, values);
      mark(query);
      const intercepted = queryInterceptor?.(query, params);
      if (intercepted) return intercepted;

      if (query.startsWith('SELECT table_name AS "TABLE_NAME" FROM information_schema.tables')) {
        const names = [
          db.legacyTables.drafts ? "resume_drafts" : null,
          db.legacyTables.experiences ? "resume_experiences" : null,
        ].filter((name) => name !== null);
        return names.map((name) => ({ TABLE_NAME: name }));
      }
      if (query.startsWith("SELECT session_id FROM resume_drafts")) {
        if (!db.legacyTables.drafts) throw new Error("Missing resume_drafts table");
        return [...db.legacyDrafts]
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
          .map(({ session_id }) => ({ session_id }));
      }
      if (query.startsWith("SELECT COUNT(*) AS total FROM resume_drafts")) {
        if (!db.legacyTables.drafts) throw new Error("Missing resume_drafts table");
        return [{ total: BigInt(db.legacyDrafts.length) }];
      }
      if (query.startsWith("SELECT resume_data FROM resume_drafts")) {
        if (!db.legacyTables.drafts) throw new Error("Missing resume_drafts table");
        return db.legacyDrafts
          .filter((row) => row.session_id === params[0])
          .map(({ resume_data }) => ({ resume_data }));
      }
      if (query.startsWith("SELECT company, role, from_month")) {
        if (!db.legacyTables.experiences) throw new Error("Missing resume_experiences table");
        return db.legacyExperiences
          .filter((row) => row.session_id === params[0])
          .sort((a, b) => a.position - b.position)
          .map(({ company, role, from_month, to_month, description }) => ({
            company,
            role,
            from_month,
            to_month,
            description,
          }));
      }
      throw new Error(`Unexpected Prisma raw query: ${query}`);
    },
  );
  prismaObject.$executeRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const { query, values: params } = templateQuery(strings, values);
      mark(query);
      if (query === "DROP TABLE IF EXISTS resume_experiences") {
        db.legacyTables.experiences = false;
        db.legacyExperiences = [];
        return 0;
      }
      if (query === "DROP TABLE IF EXISTS resume_drafts") {
        if (db.legacyTables.experiences) {
          throw new Error("Legacy experience table still exists");
        }
        db.legacyTables.drafts = false;
        db.legacyDrafts = [];
        return 0;
      }
      if (query.startsWith("DELETE FROM resume_drafts")) {
        db.legacyDrafts = db.legacyDrafts.filter(
          (row) => row.session_id !== params[0],
        );
        db.legacyExperiences = db.legacyExperiences.filter(
          (row) => row.session_id !== params[0],
        );
        return 1;
      }
      throw new Error(`Unexpected Prisma raw execution: ${query}`);
    },
  );

  let snapshot:
    | Pick<
        typeof db,
        "versions" | "experiences" | "legacyDrafts" | "legacyExperiences"
      >
    | undefined;
  const clone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value), (key, item) =>
      key === "created_at" || key === "updated_at" ? new Date(item) : item,
    );
  prismaObject.$transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    db.transactions.begun += 1;
    snapshot = {
      versions: clone(db.versions),
      experiences: clone(db.experiences),
      legacyDrafts: clone(db.legacyDrafts),
      legacyExperiences: clone(db.legacyExperiences),
    };
    try {
      const result = await work(prismaObject);
      db.transactions.committed += 1;
      snapshot = undefined;
      return result;
    } catch (error) {
      db.transactions.rolledBack += 1;
      if (snapshot) Object.assign(db, snapshot);
      snapshot = undefined;
      throw error;
    }
  });

  function seedLegacyDraft(
    accountId: string,
    resumeData: unknown,
    experiences: Omit<LegacyExperienceRow, "session_id">[] = [],
  ) {
    db.legacyTables = { drafts: true, experiences: true };
    db.legacyDrafts.push({
      session_id: accountId,
      resume_data:
        typeof resumeData === "string" ? resumeData : JSON.stringify(resumeData),
      created_at: nextDate(),
    });
    for (const row of experiences) {
      db.legacyExperiences.push({ session_id: accountId, ...row });
    }
  }

  return {
    db,
    prisma: prismaObject as unknown as PrismaClient,
    seedLegacyDraft,
    interceptQueryRaw(
      interceptor: (query: string, values: unknown[]) => unknown[] | undefined,
    ) {
      queryInterceptor = interceptor;
    },
  };

  function versionSummary(row: VersionRow) {
    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    };
  }

  function jsonValue(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
