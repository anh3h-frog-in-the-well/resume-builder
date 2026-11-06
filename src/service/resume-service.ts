import type { Prisma } from "@prisma/client";
import type {
  Resume,
  ResumeVersion,
  ResumeVersionSummary,
} from "../interface/resume";
import { getPrismaClient } from "../lib/prisma";
import {
  createSampleResume,
  defaultResumeTitle,
  maxResumeVersions,
} from "../util/resume-helper";
import {
  insertVersion,
  mapSummary,
  selectVersionResume,
  selectVersions,
  writeVersionExperiences,
} from "./resume-storage";

/**
 * Raised for expected business-rule failures so route handlers can map them to
 * a status code without inspecting messages.
 */
export class ResumeServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ResumeServiceError";
  }
}

async function withTransaction<T>(
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const prisma = await getPrismaClient();
  return prisma.$transaction(work);
}

async function selectVersion(
  connection: Prisma.TransactionClient,
  accountId: string,
  resumeId: string,
) {
  const row = await connection.resumeVersion.findFirst({
    where: { id: resumeId, accountId },
    select: { id: true, title: true, updatedAt: true },
  });
  return row ? mapSummary(row) : null;
}

export type ResumeVersionList = {
  resumes: ResumeVersionSummary[];
  /** True when the account had no resume yet and the sample one was created. */
  isNew: boolean;
};

/**
 * Lists the account's resume versions in creation order. An account always has
 * at least one version: a brand-new account receives the sample resume.
 */
export async function listResumeVersions(
  accountId: string,
): Promise<ResumeVersionList> {
  return withTransaction(async (connection) => {
    let resumes = await selectVersions(connection, accountId);
    if (resumes.length > 0) return { resumes, isNew: false };

    await insertVersion(
      connection,
      accountId,
      defaultResumeTitle,
      createSampleResume(),
    );
    resumes = await selectVersions(connection, accountId);
    return { resumes, isNew: true };
  });
}

export async function createResumeVersion(
  accountId: string,
  title: string,
  resume: Resume,
): Promise<ResumeVersionSummary> {
  return withTransaction(async (connection) => {
    const count = await connection.resumeVersion.count({ where: { accountId } });
    if (count >= maxResumeVersions) {
      throw new ResumeServiceError(
        `You can keep up to ${maxResumeVersions} resumes. Delete one to create another.`,
        409,
      );
    }

    const id = await insertVersion(connection, accountId, title, resume);
    const created = await selectVersion(connection, accountId, id);
    if (!created) {
      throw new Error("The new resume version could not be read back.");
    }
    return created;
  });
}

export async function getResumeVersion(
  accountId: string,
  resumeId: string,
): Promise<ResumeVersion | null> {
  return withTransaction((connection) =>
    selectVersionResume(connection, accountId, resumeId),
  );
}

/** Saves the content of a version. Returns false when it does not exist. */
export async function saveResumeVersion(
  accountId: string,
  resumeId: string,
  resume: Resume,
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const result = await connection.resumeVersion.updateMany({
      where: { id: resumeId, accountId },
      data: {
        resumeData: JSON.parse(
          JSON.stringify({ ...resume, experience: [] }),
        ) as Prisma.InputJsonValue,
      },
    });
    if (result.count === 0) return false;

    await writeVersionExperiences(connection, resumeId, resume.experience);
    return true;
  });
}

/** Renames a version. Returns false when it does not exist. */
export async function renameResumeVersion(
  accountId: string,
  resumeId: string,
  title: string,
): Promise<boolean> {
  const prisma = await getPrismaClient();
  const result = await prisma.resumeVersion.updateMany({
    where: { id: resumeId, accountId },
    data: { title },
  });
  return result.count > 0;
}

/**
 * Deletes a version. The last remaining version of an account cannot be
 * deleted so the editor always has something to open.
 */
export async function deleteResumeVersion(
  accountId: string,
  resumeId: string,
): Promise<boolean> {
  return withTransaction(async (connection) => {
    const resumes = await selectVersions(connection, accountId);
    if (!resumes.some((version) => version.id === resumeId)) return false;
    if (resumes.length === 1) {
      throw new ResumeServiceError(
        "Keep at least one resume. Create another one before deleting this one.",
        409,
      );
    }

    await connection.resumeVersion.deleteMany({
      where: { id: resumeId, accountId },
    });
    return true;
  });
}
