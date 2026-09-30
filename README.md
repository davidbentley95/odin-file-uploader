# File Uploader

A stripped-down Google Drive clone: create nested folders, upload files into them,
download them again through short-lived signed URLs, and hand out read-only
public links to a folder that expire on their own.

Files are stored in a private Supabase Storage bucket, never on the app server's
disk. Nothing in the bucket is publicly readable — every download goes through a
signed URL generated on demand and valid for 60 seconds.

## Stack

| Concern | Choice |
|---|---|
| Server | Express 5 |
| Views | EJS |
| ORM | Prisma 7 (`prisma-client` generator, ESM output) |
| Database | PostgreSQL |
| Auth | Passport + `passport-local`, `bcryptjs` |
| Sessions | `express-session` + `@quixo3/prisma-session-store` |
| Uploads | `multer` v2, memory storage |
| Storage | Supabase Storage (private bucket, signed URLs) |
| Validation | `express-validator` |

The project is ESM throughout (`"type": "module"`), and local imports carry
explicit file extensions.

## Local setup

Requires Node 22.18 or newer. Prisma 7's client generator emits TypeScript, which
Node runs directly via its built-in type stripping — on older versions the
generated client will not load.

```bash
git clone <this repo>
cd odin-file-uploader
npm install
```

Create the database and a role for it:

```bash
createdb file_uploader
psql -d postgres -c "CREATE ROLE uploader LOGIN PASSWORD 'choose-a-password' CREATEDB;"
psql -d postgres -c "ALTER DATABASE file_uploader OWNER TO uploader;"
```

`CREATEDB` on the role is needed because Prisma Migrate creates a shadow database
during development.

Copy `.env.example` to `.env` and fill it in:

```
DATABASE_URL="postgresql://uploader:PASSWORD@localhost:5432/file_uploader"
SESSION_SECRET="replace_with_long_random_string"
SUPABASE_URL=""
SUPABASE_SERVICE_KEY=""
SUPABASE_BUCKET="files"
PORT=3000
```

Then migrate and run:

```bash
npm run migrate    # prisma migrate dev
npm run dev        # nodemon app.js
```

`npm run studio` opens Prisma Studio if you want to look at the tables.

Note that the connection string lives in `prisma.config.js`, not in
`prisma/schema.prisma` — Prisma 7 no longer accepts `url` inside the datasource
block. The CLI reads it from that config file; the running app passes it to the
client through the `@prisma/adapter-pg` driver adapter in `lib/prisma.js`.

## Supabase bucket setup

1. Create a Supabase project.
2. Under Storage, create a bucket named to match `SUPABASE_BUCKET` (default
   `files`). **Make it private, not public.**
3. Copy the project URL into `SUPABASE_URL` and the *service role* key into
   `SUPABASE_SERVICE_KEY`.

The service role key bypasses row-level security. It is a server-only secret: it
must never appear in a view, a client-side script, a log line, or this README.

Objects are keyed `<userId>/<uuid><ext>`. The database stores that object key,
never a URL — a stored URL would be a stored thing that stops working.

## Deployment (Render)

`render.yaml` in the repo root describes the service, so Render can pick it up
as a Blueprint; the same values work if you create the web service by hand.

- **Build command:** `npm ci --include=dev && npm run build`
  (`npm run build` is `prisma generate && prisma migrate deploy`)
- **Start command:** `npm start`
- **Health check path:** `/`
- **Node version:** pinned to 24.13.1 by `.node-version`

`prisma generate` has to run at build time because `generated/` is not committed,
and Prisma 7's generated client is TypeScript that Node executes via its built-in
type stripping — hence the pinned Node version.

Environment variables to set in the Render dashboard:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon pooled connection string |
| `SESSION_SECRET` | a long random string (Render can generate it) |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the service role key |
| `SUPABASE_BUCKET` | `files` |

`NODE_ENV=production` is not optional: it is what switches on `trust proxy` and
the `Secure` session cookie. Without it the cookie is never set behind Render's
HTTPS terminator and nobody can stay logged in.

Deployed URL: _not yet deployed._

## Known limitations

These are deliberate, not oversights:

- **No duplicate-name prevention.** Two files or folders can share a name in the
  same location. A `@@unique([ownerId, parentId, name])` constraint would not fix
  it, because Postgres treats `NULL` parents as distinct and root-level
  duplicates would slip through anyway.
- **No move operation.** Files and folders stay where they are created.
- **No storage quota per user.**
- **Share links cannot be revoked** before they expire.
- **Deletes are hard deletes.** No trash, no recovery.
