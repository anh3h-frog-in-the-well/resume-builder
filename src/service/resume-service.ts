import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { Resume } from "../interface/resume";
import { getMysqlPool } from "../lib/mysql";
import { normalizeResume } from "../util/resume-helper";

type ResumeDraftRow = RowDataPacket & {
  resume_data: unknown;
};

type ResumeExperienceRow = RowDataPacket & {
  company: string;
  role: string;
  from_month: string;
  to_month: string;
  description: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function withTransaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const pool = await getMysqlPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getResumeDraft(userId: string): Promise<Resume | null> {
  return withTransaction(async (connection) => {
    const [draftRows] = await connection.execute<ResumeDraftRow[]>(
      "SELECT resume_data FROM resume_drafts WHERE session_id = ?",
      [userId],
    );
    const draftRow = draftRows[0];
    if (!draftRow) return null;

    const [experienceRows] = await connection.execute<ResumeExperienceRow[]>(
      `SELECT company, role, from_month, to_month, description
       FROM resume_experiences
       WHERE session_id = ?
       ORDER BY position`,
      [userId],
    );

    let storedData = draftRow.resume_data;
    if (typeof storedData === "string") {
      try {
        storedData = JSON.parse(storedData);
      } catch {
        throw new Error("The stored resume data is not valid JSON.");
      }
    }
    if (!isRecord(storedData)) {
      throw new Error("The stored resume data has an invalid format.");
    }

    const resume = normalizeResume({
      ...storedData,
      experience:
        experienceRows.length > 0
          ? experienceRows.map((experience) => ({
              company: experience.company,
              role: experience.role,
              from: experience.from_month,
              to: experience.to_month,
              description: experience.description,
            }))
          : storedData.experience,
    });
    if (!resume) {
      throw new Error("The stored resume data is invalid.");
    }

    return resume;
  });
}

export async function saveResumeDraft(
  sessionId: string,
  resume: Resume,
): Promise<void> {
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO resume_drafts (session_id, resume_data)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE resume_data = VALUES(resume_data)`,
      [sessionId, JSON.stringify({ ...resume, experience: [] })],
    );
    await connection.execute(
      "DELETE FROM resume_experiences WHERE session_id = ?",
      [sessionId],
    );

    for (const [position, item] of resume.experience.entries()) {
      await connection.execute(
        `INSERT INTO resume_experiences
           (session_id, position, company, role, from_month, to_month, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          position,
          item.company,
          item.role,
          item.from,
          item.to,
          item.description,
        ],
      );
    }
  });
}
