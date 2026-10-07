import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, requireBuild } from '../scripts/artifacts.mjs';

test('缺失构建按组件报告准备命令，已有产物可直接复用', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'emd-artifacts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(requireBuild(['renderer'], directory), /dist\/index.html.*npm run build:renderer/);
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist/index.html'), '<h1>已有构建</h1>');
  await requireBuild(['renderer'], directory);
  await assert.rejects(requireBuild(['icons'], directory), /assets\/emd.png.*npm run build:icons/);
});

test('start 与 pack/dist 缺产物直接失败，不隐式执行 npm 构建', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'emd-script-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(join(root, 'scripts'), join(directory, 'scripts'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const marker = join(directory, 'implicit-build');
  const npmCli = join(directory, 'npm.mjs');
  await writeFile(npmCli, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'unexpected build');`);
  const platform = { linux: 'kde', darwin: 'mac' }[process.platform];
  const commands = [['start.mjs']];
  if (platform) commands.push(['pack.mjs', `--platform=${platform}`], ['pack.mjs', '--dist', `--platform=${platform}`]);
  for (const [script, ...args] of commands) {
    const result = spawnSync(process.execPath, [join(directory, 'scripts', script), ...args], { env: { ...process.env, npm_execpath: npmCli }, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /缺少 dist\/index.html.*npm run build:renderer/);
    await assert.rejects(access(marker), { code: 'ENOENT' });
    await assert.rejects(access(join(directory, 'dist')), { code: 'ENOENT' });
  }
});
