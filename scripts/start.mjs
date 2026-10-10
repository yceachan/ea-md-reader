import electron from 'electron';
import { root, ensureBuild } from './artifacts.mjs';
import { run } from './process.mjs';

try {
  await ensureBuild();
  process.exitCode = await run(electron, [root, ...process.argv.slice(2)]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
