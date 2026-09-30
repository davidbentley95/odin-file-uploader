import 'dotenv/config';
import { defineConfig } from '@prisma/config';

// Prisma 7 no longer accepts `url` inside the datasource block of schema.prisma.
// The connection string for the CLI (migrate, studio, db) lives here instead;
// the runtime client gets it through the pg driver adapter in lib/prisma.js.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
