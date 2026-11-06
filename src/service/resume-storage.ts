import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  Experience,
  Resume,
  ResumeVersionSummary,
} from "../interface/resume";
import { normalizeResume } from "../util/resume-helper";

export type DatabaseTransaction = Prisma.TransactionClient;
export type DatabaseClient = PrismaClient | DatabaseTransaction;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapSummary(row: {
  id: string;
  title: string;
  updatedAt: Date;
}): ResumeVersionSummary {
  return { id: row.id, title: row.title, updatedAt: toIsoString(row.updatedAt) };
}

/** Parses the JSON column, which may be text in older records. */
export function parseStoredResumeData(storedData: unknown): Record<string, unknown> {
  let data = storedData;
  if (typeof data === "string") {
    try {
      console.log('data', data)
      data = JSON.parse(data);
    } catch {
      throw new Error("The stored resume data is not valid JSON.");
    }
  }
  if (!isRecord(data)) {
    throw new Error("The stored resume data has an invalid format.");
  }
  return data;
}

type ExperienceRow = {
  company: string;
  role: string;
  fromMonth: string;
  toMonth: string;
  description: string;
};

export function mapExperienceRows(rows: ExperienceRow[]): Experience[] {
  return rows.map((row) => ({
    company: row.company,
    role: row.role,
    from: row.fromMonth,
    to: row.toMonth.trim(),
    description: row.description,
  }));
}

/** Rebuilds a resume from the JSON column plus its relational experience rows. */
export function buildStoredResume(
  storedData: unknown,
  experienceRows: ExperienceRow[],
): Resume {
  const resume = normalizeResume({
    ...parseStoredResumeData(storedData),
    experience: mapExperienceRows(experienceRows),
  });
  if (!resume) {
    throw new Error("The stored resume data is invalid.");
  }
  return resume;
}

export async function selectVersionExperiences(
  connection: DatabaseClient,
  resumeId: string,
) {
  return connection.resumeVersionExperience.findMany({
    where: { resumeId },
    orderBy: { position: "asc" },
    select: {
      company: true,
      role: true,
      fromMonth: true,
      toMonth: true,
      description: true,
    },
  });
}

export async function writeVersionExperiences(
  connection: DatabaseClient,
  resumeId: string,
  experience: Experience[],
) {
  await connection.resumeVersionExperience.deleteMany({ where: { resumeId } });
  if (experience.length === 0) return;

  await connection.resumeVersionExperience.createMany({
    data: experience.map((item, position) => ({
      resumeId,
      position,
      company: item.company,
      role: item.role,
      fromMonth: item.from,
      toMonth: item.to,
      description: item.description,
    })),
  });
}

/** Inserts a version and its experience rows; returns the new id. */
export async function insertVersion(
  connection: DatabaseClient,
  accountId: string,
  title: string,
  resume: Resume,
) {
  const id = randomUUID();
  const resumeData: Prisma.InputJsonValue = JSON.parse(
    JSON.stringify({ ...resume, experience: [] }),
  );
  await connection.resumeVersion.create({
    data: { id, accountId, title, resumeData },
  });
  await writeVersionExperiences(connection, id, resume.experience);
  return id;
}

/** Reads a version's content back from both tables. */
export async function selectVersionResume(
  connection: DatabaseClient,
  accountId: string,
  resumeId: string,
) {
  const row = await connection.resumeVersion.findFirst({
    where: { id: resumeId, accountId },
    include: {
      experiences: {
        orderBy: { position: "asc" },
        select: {
          company: true,
          role: true,
          fromMonth: true,
          toMonth: true,
          description: true,
        },
      },
    },
  });
  if (!row) return null;

  console.log('resumeData experiences', row.experiences)

  return {
    ...mapSummary(row),
    resume: buildStoredResume(row.resumeData, row.experiences),
  };
}

export async function selectVersions(
  connection: DatabaseClient,
  accountId: string,
) {
  const rows = await connection.resumeVersion.findMany({
    where: { accountId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map(mapSummary);
}
