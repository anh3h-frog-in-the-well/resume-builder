import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../lib/mysql";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
};

type AuthUserRow = RowDataPacket & {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
};

function mapAuthUser(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
  };
}

export async function findAuthUserByEmail(email: string) {
  const pool = await getMysqlPool();
  const [rows] = await pool.execute<AuthUserRow[]>(
    "SELECT id, email, name, password_hash FROM `account` WHERE email = ?",
    [email],
  );
  return rows[0] ? mapAuthUser(rows[0]) : null;
}

export async function createPasswordUser(
  email: string,
  name: string,
  passwordHash: string,
) {
  const pool = await getMysqlPool();
  const user: AuthUser = {
    id: randomUUID(),
    email,
    name,
    passwordHash,
  };
  await pool.execute(
    `INSERT INTO \`account\` (id, email, name, password_hash)
     VALUES (?, ?, ?, ?)`,
    [user.id, user.email, user.name, user.passwordHash],
  );
  return user;
}
