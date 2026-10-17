// Marks the CLI entry point as executable after `tsc` (needed for `npx` on POSIX).
import { chmodSync } from 'node:fs';

chmodSync(new URL('../dist/index.js', import.meta.url), 0o755);
