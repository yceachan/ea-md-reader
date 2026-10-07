import { join } from 'node:path';
import { root, requireBuild, requirePackage } from './artifacts.mjs';
import { run } from './process.mjs';

try {
  const args = process.argv.slice(2);
  const packaged = args[0] === '--packaged';
  if (packaged) args.shift();
  if (packaged) await requirePackage();
  else await requireBuild();
  const command = [process.execPath, join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...(packaged ? ['--config=playwright.packaged.config.cjs'] : []), ...args];
  process.exitCode = process.platform === 'linux'
    ? await run('xvfb-run', ['-a', '-s', '-screen 0 2560x1440x24', '/bin/sh', join(root, 'scripts/test-ui-linux.sh'), ...command], { cwd: root })
    : await run(command[0], command.slice(1), { cwd: root });
} catch (error) { console.error(error.message); process.exitCode = 1; }
