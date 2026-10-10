import { join } from 'node:path';
import { root, ensureBuild, ensurePackage } from './artifacts.mjs';
import { selectPlatform } from './platforms.mjs';
import { run } from './process.mjs';

try {
  const args = process.argv.slice(2);
  const shellTest = args[0] === '--windows-shell';
  if (shellTest) {
    args.shift();
    if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'self-hosted' || process.env.EMD_DEDICATED_WINDOWS_DESKTOP !== '1') throw new Error('Windows Shell 测试只允许在专用自托管 CI 桌面执行。');
    process.env.EMD_WINDOWS_SHELL = '1';
  }
  const packaged = args[0] === '--packaged';
  if (packaged) args.shift();
  if (packaged) await ensurePackage(selectPlatform().id);
  else await ensureBuild();
  const command = [process.execPath, join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...(packaged ? ['--config=playwright.packaged.config.cjs'] : []), ...args];
  if (process.platform === 'linux') {
    process.exitCode = await run('xvfb-run', ['-a', '-s', '-screen 0 2560x1440x24', '/bin/sh', join(root, 'scripts/test-ui-linux.sh'), ...command], { cwd: root });
  } else if (process.platform === 'win32' && !shellTest) {
    process.exitCode = await run('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
      join(root, 'scripts/test-ui-windows.ps1'), JSON.stringify(command)], { cwd: root });
  } else {
    process.exitCode = await run(command[0], command.slice(1), { cwd: root });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
