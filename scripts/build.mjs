import { buildGroup } from './artifacts.mjs';

try {
  if (process.argv.length !== 3) throw new Error('用法：node scripts/build.mjs icons|native|renderer');
  await buildGroup(process.argv[2]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
