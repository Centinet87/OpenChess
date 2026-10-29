import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// El .env vive en la raíz del workspace, no en esta lib.
config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
