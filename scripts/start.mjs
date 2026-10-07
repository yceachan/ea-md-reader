import electron from 'electron';
import { root, requireBuild } from './artifacts.mjs';
import { run } from './process.mjs';

try {
  await requireBuild();
  process.exitCode = await run(electron, [root, ...process.argv.slice(2)]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
