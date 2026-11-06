# Resume builder

Resume builder is a responsive resume editor built with Next.js, React, TypeScript, and Tailwind CSS. Edit your resume in guided sections and see changes in the live preview. You can polish your data with local Ollama model.

## Features

- Edit personal details, professional summary, skills, work experience, and education.
- Upload an optional profile photo; it is resized in the browser and saved with the resume.
- Choose between Modern, Classic, and Creative templates for the preview and exports.
- Import and export complete resume drafts as validated JSON files.
- Add or remove experience and education entries.
- Keep up to 10 resume versions per account: switch between them, create a blank one, duplicate the open one, rename, and delete.
- Automatically save the open resume and load the signed-in account's resumes from the server; the last opened resume is reopened on the next visit.
- Manage resumes through the JSON API: `GET`/`POST /api/resumes` and `GET`/`PUT`/`PATCH`/`DELETE /api/resumes/{id}`.
- Create an account or sign in with email and password.
- Require sign-in to access or edit the resume workspace.
- Polish the professional summary and work experience descriptions with the local Ollama model.
- Export a Word-compatible `.doc` file or print/save the resume as a PDF.
- Use the page on desktop or mobile.

## Run locally

Configure your PostgreSQL connection in `.env.local` (this file is ignored by Git).
Prisma uses the URL to connect and the checked-in migrations to version the
schema; create the database itself before running the migration:

```dotenv
DATABASE_URL=postgresql://your-user:your-password@127.0.0.1:5432/resume-builder?schema=public
AUTH_SECRET=generate-a-long-random-secret
AUTH_TRUST_HOST=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=your-local-ai-model
```

Generate `AUTH_SECRET` with `npx auth secret`. Set `AUTH_TRUST_HOST=true` for local development. In production, enable it only when the app is reached through a host or reverse proxy you control that supplies the correct host headers.
Summary and work-experience polishing send the current text to the configured local Ollama server only. The default is `http://localhost:11434` with the `qwen2.5:1.5b` model. Ensure Ollama is running and reachable from the app host; change these settings in `.env.local` if needed. Polished text replaces the existing text and is autosaved, so review it before using it.

Install dependencies and start the development server:

```bash
npm install
npm run db:generate
npm run db:deploy
npm run dev
```

When switching from MySQL, create a separate PostgreSQL database and apply its
migrations there. Prisma migrations create/version the schema; they do not
transfer rows from MySQL. Back up the MySQL database and migrate any accounts
and resumes separately before pointing the app at PostgreSQL. Do not run these
PostgreSQL migrations against the old MySQL database.

If you have already imported the application tables into PostgreSQL, verify
they match `prisma/schema.prisma` before baselining the initial migration:

```bash
npx prisma migrate resolve --applied 20261105155200_init
```

The application still migrates remaining `resume_drafts` to resume versions on
first database use. New schema changes should be made in `prisma/schema.prisma`
and committed as migrations with `npm run db:migrate`; deploy released
migrations with `npm run db:deploy`.

Open [http://localhost:3000](http://localhost:3000) for local development.

Run the checks and production build with:

```bash
npm run lint
npm run typecheck
npm run build
```

## Testing

Neither test suite needs a PostgreSQL server, an Ollama server, or network access to external services.

### Unit and component tests

Unit tests run with [Vitest](https://vitest.dev) and React Testing Library in a jsdom environment. They cover the client components in `src/client`, the editor and login pages, the helpers in `src/util`, the password and Ollama helpers, the resume service (against an in-memory Prisma stand-in), and the API route handlers (with the auth and database services mocked).

```bash
npm test                # run once
npm run test:watch      # watch mode
npm run test:coverage   # run with a coverage report in coverage/
```

Tests live in `tests/unit`, mirroring the `src` layout. Shared fixtures are in `tests/unit/fixtures`.

### End-to-end tests

End-to-end tests run with [Playwright](https://playwright.dev) against the real Next.js app in Chromium (desktop and a mobile viewport). They exercise the user-facing workflows only — signing in and registering, editing each resume section, live preview, templates, managing resume versions, JSON import/export, Word/PDF export, photo upload, and AI polishing — and never talk to a database:

- Playwright starts the app itself with throw-away settings (`tests/e2e/support/env.ts`) that take precedence over `.env.local`, so your real database credentials are never used.
- The browser is signed in by minting a session cookie with the same Auth.js secret the test server uses, so no account has to exist.
- Every data endpoint (`/api/resumes`, `/api/register`, `/api/polish-*`, the credentials callback) is intercepted in the browser with `page.route`; an in-memory fake of the versions API records what the UI would have saved.

Install the browser once, then run the suite:

```bash
npx playwright install chromium
npm run test:e2e          # headless
npm run test:e2e:ui       # Playwright UI mode
```

The test server runs with `NEXT_BROWSER_LOGS=off`, which stops the dev server from mirroring the browser console into the terminal (the tests intentionally trigger error paths that log in the browser; Playwright keeps that output in its own traces). By default the tests run against `next dev` on port 3100 (override with `E2E_PORT`). Set `E2E_SERVER=production` to run against `next build && next start` instead. Specs live in `tests/e2e`; shared fixtures and the editor page object are in `tests/e2e/support`.

## Production Docker deployment

The Compose configuration reads `DATABASE_URL` from `.env.local`; that file is ignored by Git and excluded from the Docker build context. Apply migrations from the release checkout with `npm run db:deploy` before starting the application, then build and start the production container:

```bash
docker compose -f docker-compose.yml up --build -d
```

The production site is served on port `3001` at [http://localhost:3001](http://localhost:3001). Check deployment status and logs with:

```bash
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f resume-builder
```

The database host remains `127.0.0.1` inside the container, matching `.env.local`. Ensure the Docker host can route to that PostgreSQL server and that PostgreSQL allows connections from the Docker host. The app container does not include or start a PostgreSQL server.

Create the `resume_builder` database beforehand. The PostgreSQL user must be allowed to connect to it; grant schema privileges needed by Prisma Migrate to the account that applies deployments. `npm run db:deploy` creates or updates the `resume_versions`, `resume_version_experiences`, and `account` tables according to the committed migrations. The app no longer creates tables at runtime.

#### Upgrading from the single-draft schema

Earlier releases stored one draft per account in `resume_drafts` and `resume_experiences`. After baselining the existing tables as described above, the app migrates remaining drafts the first time it connects:

- Each remaining draft is copied into a resume version titled "My resume", read back and compared with the original, and only then removed — one transaction per draft, with the draft row locked so several app instances starting at once cannot duplicate it.
- A draft that cannot be migrated (for example corrupt JSON) is logged with its account id and left untouched; the app keeps working on the new tables and retries the migration on the next start.
- `resume_drafts` and `resume_experiences` are dropped only once every draft has been migrated (`DROP TABLE` therefore needs the `DROP` privilege for that one-off step). Afterwards the migration is a no-op.

Check the server log on the first start after upgrading for `Migrated N legacy resume draft(s) ... and dropped the legacy tables.`

Other resume details are stored as JSON in database. The editor and its resume API require an authenticated account; signed-out visitors are redirected to the login page. The API uses Next.js route handlers and its Node.js runtime; the server determines the account from the authenticated session, so resumes are never transferred between accounts. Password accounts require a password of at least 8 characters. Email verification and password recovery are not included.

### Resume API

| Method and path | Purpose |
| --- | --- |
| `GET /api/resumes` | Lists the account's resume versions (`{ resumes: [{ id, title, updatedAt }], isNew }`). A brand-new account receives the sample resume and `isNew: true`. |
| `POST /api/resumes` | Creates a version from an optional `{ title, resume }` body (defaults: "Untitled resume", blank content). Responds with `409` once the account holds 10 versions. |
| `GET /api/resumes/{id}` | Returns one version with its `resume` content. |
| `PUT /api/resumes/{id}` | Replaces the content of a version with the resume in the body. |
| `PATCH /api/resumes/{id}` | Renames a version (`{ title }`, 1–80 characters). |
| `DELETE /api/resumes/{id}` | Deletes a version. The last remaining version cannot be deleted (`409`). |

Unknown or foreign ids answer with `404`; requests without a session answer with `401`.