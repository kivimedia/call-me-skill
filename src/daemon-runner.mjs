// Tiny entry point used by `call-me-skill daemon start` to spawn the daemon
// process. Kept separate so the spawned process doesn't pull in CLI argv
// parsing or the rest of the bin script.
import { runDaemon } from './daemon.mjs';

runDaemon().catch((err) => {
  console.error('daemon crashed:', err);
  process.exit(1);
});
