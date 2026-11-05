# Neurocyte Hospital Management

A local web application for hospital staff to manage patient records, clinical reports, billing, and payment history. The frontend is a React single page app; an Express API stores application data in PostgreSQL and uploaded reports on the backend filesystem.

## Features

- Staff sign-in and registration, with administrator approval for new staff accounts.
- Patient directory and patient profile management, including contact and emergency contact details.
- Multiple clinical reports per patient, with upload dates and download/view links.
- Clinical notes and doctor suggestions.
- Billing entries with description, quantity, unit price, amount, billing date, payment status, and referred-by field.
- Patient billing grouped by date, daily totals/status, and downloadable PDF invoices with item details, amount in words, letterhead background, and configured bank details.
- Payment transaction history and patient payment status.
- Dashboard statistics and patient search.

## Architecture

```text
Browser
  └── React 19 + Vite + Tailwind CSS (frontend/)
       └── /api/*     → Express API (backend/, default port 5001)
                            ├── PostgreSQL (default database neurocyte_db)
                            └── private report files (backend/uploads/)
```

- `frontend/src/` contains the UI and API client.
- `backend/app.js` configures Express middleware, static uploads, health route, and API routes.
- `backend/routes/` contains authentication, patient, billing, admin, and statistics endpoints.
- `backend/db/schema.sql` defines the relational schema. `backend/db/initDb.js` applies the schema and idempotent demo seed data.
- `backend/config/db.js` configures the PostgreSQL connection pool.
- `backend/uploads/` stores uploaded patient report files. The directory is created automatically and is ignored by Git.

## Requirements

- Node.js compatible with Vite 8 (Node.js 22 LTS is recommended).
- npm (the repository declares npm 11.16.0).
- PostgreSQL 14 or newer, running locally or reachable from the machine running the API.

## Install on a new system

1. Clone or copy the project, then enter its root directory:

   ```sh
   cd neurocyte
   ```

2. Install dependencies from the repository root (npm workspaces install both frontend and backend dependencies):

   ```sh
   npm install
   ```

3. Create a PostgreSQL role and a fresh database. Example using the local `postgres` administrator account:

   ```sh
   psql -U postgres
   ```

   Then run these SQL statements, replacing the password with a private value:

   ```sql
   CREATE ROLE neurocyte WITH LOGIN PASSWORD 'replace-with-a-strong-password';
   CREATE DATABASE neurocyte_db OWNER neurocyte;
   \q
   ```

4. Create `backend/.env` (this file is ignored by Git):

   ```dotenv
   PORT=5001
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=neurocyte_db
   PGUSER=neurocyte
   PGPASSWORD=replace-with-a-strong-password
   JWT_SECRET=replace-with-a-long-random-secret
   CORS_ORIGINS=http://localhost:8443,http://127.0.0.1:8443
   ```

   `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER` have development defaults in the code, but set them explicitly for a new installation. Production startup requires a unique `JWT_SECRET`. Set `CORS_ORIGINS` to the comma-separated exact origins of the deployed frontend (for local development, keep the localhost values shown). The backend loads `backend/.env` on startup.

5. Start the API in one terminal:

   ```sh
   npm run dev:backend
   ```

   On its first startup, the API creates/synchronizes the schema and inserts the default seed records. Wait for the server-ready message before starting the frontend.

6. Start the frontend in another terminal:

   ```sh
   npm run dev:frontend
   ```

   Open the Vite URL printed in the terminal (by default `http://localhost:8443`). Vite forwards `/api` requests to `http://localhost:5001`.

## Seed data

Database setup and demo seeding happen automatically every time the backend starts. For a new empty database, initialization:

- Creates the tables, indexes, and supporting sequence from `backend/db/schema.sql`.
- Creates an administrator and sample authorized/pending staff accounts if they do not already exist.
- Adds two sample patients and example clinical/payment records when the patient table is empty.
- Adds example bills on multiple dates for the matching sample patients, avoiding duplicate entries.
- Converts existing patient billing balances into an itemized balance entry where needed and synchronizes patient IDs.

Demo sign-in accounts:

| Account | Email | Password | Access |
| --- | --- | --- | --- |
| Administrator | `admin@neurocyte.io` | `AdminPassword123!` | Administrator tools and staff approval |
| Authorized staff | `jordan@neurocyte.io` | `Password123!` | Staff application access |
| Pending staff | `marcus.chen@neurocyte.io` | `Password123!` | Pending until approved by an administrator |

These credentials are for local demo data only. Change or remove seeded accounts and passwords before exposing an installation to a network or using real patient information. Do not use sample patient data for real care.

To explicitly run database initialization/seeding without starting the web server:

```sh
node backend/db/runseed.js
```

The seeder is intended to be re-runnable against the same database. For a fully fresh seed, create a new empty database and point `backend/.env` at it; do not delete a database containing records you need.

## Useful commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev:backend` | Start the API with Node watch mode |
| `npm run dev:frontend` | Start the Vite development server |
| `npm run server` | Start the API without watch mode |
| `npm run build` | Build the frontend into `dist/` |
| `npm run preview` | Preview the built frontend with Vite |
| `npm run format` | Format project files with Oxfmt |

The root `npm run dev` script runs Vite only; run the backend separately as described above.

## Uploaded reports and backups

Uploaded reports are stored under `backend/uploads/`. They are not exposed as static files: staff must be authorized, and the report must belong to the patient in the request before the API streams it. The upload handler accepts PDF, JPG/JPEG, PNG, DOC, DOCX, and plain text files up to 15 MB. Database backups do not include these files, so back up both PostgreSQL and `backend/uploads/` together. When moving to a new machine, preserve the uploads directory if patient report links must continue to work.

Authenticated API requests re-check the staff account against PostgreSQL, so approving, rejecting, or otherwise deauthorizing a staff account takes effect immediately. Access to patient records is currently shared among all authorized staff; the app does not yet model patient assignment or department-specific patient access.

## PDF invoice settings

Invoice PDFs use the letterhead image bundled with the frontend and the bank details hard-coded in the invoice generation code. To update those details or the letterhead, change the corresponding frontend invoice-generation source/assets and rebuild the frontend. The image is part of the app distribution; uploaded clinical files are separate backend data.

## Troubleshooting

- **API cannot connect to PostgreSQL:** confirm PostgreSQL is running and that the `PG*` values in `backend/.env` match the database role/database. Check that the role can connect and create/use the schema objects.
- **Frontend shows API/network errors:** confirm the backend is listening on port 5001 and that Vite's `/api` proxy target in `frontend/vite.config.js` matches the backend port.
- **Port is already in use:** change `PORT` in `backend/.env` for the API and update the Vite proxy target accordingly; the frontend development port defaults to 8443.
- **Private report download returns 404:** restore the matching files into `backend/uploads/`; database report records refer to those stored filenames.
- **Admin account was not created:** initialization only inserts the default administrator when there is no staff row marked as an administrator. Check the `staff` table before changing seed logic.

## Configuration notes

The backend has a fallback JWT secret for local development and refuses to start in production without `JWT_SECRET`. Changing the secret invalidates previously issued sessions, so staff must sign in again. Keep `.env` files and real patient data out of source control. The application is designed as an operational starting point; review authentication, deployment, backups, access controls, and applicable privacy requirements before production use.
