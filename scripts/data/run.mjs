// Entry point for `npm run data` — runs the ingest pipeline (Node, type-stripped TS).
import { run } from './pipeline.ts';

try {
  await run();
} catch (err) {
  console.error('[rcm:ingest] FAILED:', err);
  process.exitCode = 1;
}
