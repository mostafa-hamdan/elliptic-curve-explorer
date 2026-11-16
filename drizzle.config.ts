/**
 * Settings for drizzle-kit, the tool that turns `server/db/schema.ts` into SQL migration
 * files in `server/db/migrations`. Run `npm run db:generate` after changing the schema.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
});
