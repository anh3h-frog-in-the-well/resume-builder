# Resume builder

Resume builder is a responsive resume editor built with Next.js, React, TypeScript, and Tailwind CSS. Edit your resume in guided sections and see changes in the live preview. You can polish your data with local Ollama model.

## Features

- Edit personal details, professional summary, skills, work experience, and education.
- Upload an optional profile photo; it is resized in the browser and saved with the resume.
- Choose between Modern, Classic, and Creative templates for the preview and exports.
- Import and export complete resume drafts as validated JSON files.
- Add or remove experience and education entries.
- Automatically save drafts and load the signed-in account's draft from the server.
- Retrieve the signed-in account's saved resume with `GET /api/resume`.
- Create an account or sign in with email and password.
- Require sign-in to access or edit the resume workspace.
- Polish the professional summary and work experience descriptions with the local Ollama model.
- Export a Word-compatible `.doc` file or print/save the resume as a PDF.
- Use the page on desktop or mobile.

## Run locally

Configure the database in `.env.local` (this file is ignored by Git):

```dotenv
MYSQL_HOST=http://localhost
MYSQL_PORT=3306
MYSQL_USER=your-user
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=resume-builder
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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for local development.

Run the checks and production build with:

```bash
npm run lint
npm run build
```

Run the browser-based component tests with:

```bash
npx playwright install chromium
npm run test:components
```

The tests use a development-only component gallery and do not require a database or authenticated session.

## Production Docker deployment

The Compose configuration reads the MySQL settings from `.env.local`; that file is ignored by Git and excluded from the Docker build context. Create it on the deployment host with the same database settings shown above, then build and start the production container:

```bash
docker compose -f docker-compose.yml up --build -d
```

The production site is served on port `3001` at [http://localhost:3001](http://localhost:3001). Check deployment status and logs with:

```bash
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f resume-builder
```

The database host remains `127.0.0.1` inside the container, matching `.env.local`. Ensure the Docker host can route to that MySQL server and that MySQL allows connections from the Docker host. The app container does not include or start a MySQL server.

The MySQL user must be allowed to connect from the app host and create the database/tables on first use. The app creates the `resume-builder` database (if needed), the `resume_drafts` table for resume details, the related `resume_experiences` table, and the `account` table for email/password accounts automatically.

Other resume details are stored as JSON in database. The editor and its resume API require an authenticated account; signed-out visitors are redirected to the login page. `GET /api/resume` returns the authenticated account's saved resume, or a 404 response if no draft exists. Drafts are saved to and loaded from the signed-in account in server; the server determines the account from the authenticated session, so drafts are not transferred between accounts. Password accounts require a password of at least 8 characters. Email verification and password recovery are not included. The API uses Next.js route handlers and its Node.js runtime.