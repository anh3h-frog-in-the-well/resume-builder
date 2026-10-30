import mysql, { type Pool } from "mysql2/promise";

const globalForMysql = globalThis as typeof globalThis & {
  mysqlPoolPromise?: Promise<Pool>;
};

function getDatabaseConfig() {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  const port = Number(process.env.MYSQL_PORT ?? "3306");

  if (!host || !user || !password || !database) {
    throw new Error(
      "MySQL configuration is incomplete. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE.",
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MYSQL_PORT must be a valid TCP port.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(database)) {
    throw new Error("MYSQL_DATABASE contains invalid characters.");
  }

  return { host, user, password, database, port };
}

async function createPool(): Promise<Pool> {
  const config = getDatabaseConfig();
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    charset: "utf8mb4",
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }

  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resume_drafts (
        session_id CHAR(36) NOT NULL PRIMARY KEY,
        resume_data JSON NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resume_experiences (
        session_id CHAR(36) NOT NULL,
        position INT UNSIGNED NOT NULL,
        company VARCHAR(255) NOT NULL DEFAULT '',
        role VARCHAR(255) NOT NULL DEFAULT '',
        from_month CHAR(7) NOT NULL DEFAULT '',
        to_month CHAR(7) NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        PRIMARY KEY (session_id, position),
        CONSTRAINT fk_resume_experiences_draft
          FOREIGN KEY (session_id) REFERENCES resume_drafts(session_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`account\` (
        id CHAR(36) NOT NULL PRIMARY KEY,
        email VARCHAR(320) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    await pool.end();
    throw error;
  }

  return pool;
}

export function getMysqlPool(): Promise<Pool> {
  if (!globalForMysql.mysqlPoolPromise) {
    const poolPromise = createPool();
    globalForMysql.mysqlPoolPromise = poolPromise;
    void poolPromise.catch(() => {
      if (globalForMysql.mysqlPoolPromise === poolPromise) {
        delete globalForMysql.mysqlPoolPromise;
      }
    });
  }
  return globalForMysql.mysqlPoolPromise;
}
