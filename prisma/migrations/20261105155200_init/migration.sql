CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email" ON "account"("email");

CREATE TABLE "resume_versions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "resume_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_resume_versions_account"
    ON "resume_versions"("account_id", "created_at");

CREATE TABLE "resume_version_experiences" (
    "resume_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "company" VARCHAR(255) NOT NULL DEFAULT '',
    "role" VARCHAR(255) NOT NULL DEFAULT '',
    "from_month" CHAR(7) NOT NULL DEFAULT '',
    "to_month" CHAR(7) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,

    CONSTRAINT "resume_version_experiences_pkey" PRIMARY KEY ("resume_id", "position")
);

ALTER TABLE "resume_version_experiences"
    ADD CONSTRAINT "fk_resume_version_experiences_version"
    FOREIGN KEY ("resume_id") REFERENCES "resume_versions"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
