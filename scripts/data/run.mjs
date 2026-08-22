// Entry point for `npm run data` — tsx loads the TypeScript ingest modules.
import { run } from './pipeline.ts';

try {
  await run();
} catch (err) {
  console.error('[rcm:ingest] FAILED:', err);
  process.exitCode = 1;
}
