import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// El .env vive en la raíz del workspace, no en esta lib.
config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

export default defineConfig({
  schema: fileURLToPath(new URL('./prisma/schema.prisma', import.meta.url)),
  migrations: {
    path: fileURLToPath(new URL('./prisma/migrations', import.meta.url)),
  },
  datasource: {
    url: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  },
});
