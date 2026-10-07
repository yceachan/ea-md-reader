import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parsePlatformArgs, selectPlatform } from '../scripts/platforms.mjs';

test('平台选择支持 KDE 和 macOS，TODO 平台和错误参数明确失败', async () => {
  assert.equal(selectPlatform(undefined, 'linux', 'KDE').name, 'KDE/Linux');
  assert.equal(selectPlatform(undefined, 'linux', '').name, 'KDE/Linux');
  const mac = selectPlatform(undefined, 'darwin');
  assert.equal(mac.name, 'macOS');
  assert.equal(mac.os, 'darwin');
  const adapter = await mac.load();
  assert.equal(typeof adapter.install, 'function');
  assert.equal(typeof adapter.uninstall, 'function');
  assert.deepEqual(parsePlatformArgs(['--platform', 'kde', '带 空格的目录']), { platform: 'kde', rest: ['带 空格的目录'] });
  assert.deepEqual(parsePlatformArgs(['--uninstall', '--platform=kde']), { platform: 'kde', rest: ['--uninstall'] });
  for (const [host, desktop] of [['linux', 'ubuntu:GNOME'], ['win32', '']]) assert.throws(() => selectPlatform(undefined, host, desktop), /TODO/);
  assert.throws(() => selectPlatform('kde', 'darwin'), /linux/);
  assert.throws(() => selectPlatform('mac', 'linux'), /darwin/);
  assert.throws(() => selectPlatform('typo', 'linux'), /未知平台/);
  assert.throws(() => parsePlatformArgs(['--platform']), /需要指定/);
  assert.throws(() => parsePlatformArgs(['--platform=kde', '--platform=kde']), /只能指定一次/);
});

test('TODO 打包、安装和卸载入口在执行外部命令或写入前退出', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emd-platform-'));
  try {
    const marker = join(directory, 'build-started');
    const npmCli = join(directory, 'npm.mjs');
    await writeFile(npmCli, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2))); process.exit(17);`);
    const env = { ...process.env, npm_execpath: npmCli, XDG_DATA_HOME: join(directory, 'data'), XDG_STATE_HOME: join(directory, 'state') };
    for (const platform of ['gnome', 'windows']) {
      for (const [script, args] of [['scripts/pack.mjs', []], ['scripts/install.mjs', []], ['scripts/install.mjs', ['--uninstall']]]) {
        const result = spawnSync(process.execPath, [script, `--platform=${platform}`, ...args], { cwd: resolve('.'), env, encoding: 'utf8' });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /TODO/);
      }
    }
    for (const file of [marker, join(directory, 'data'), join(directory, 'state')]) await assert.rejects(access(file), { code: 'ENOENT' });
    const foreignPlatform = process.platform === 'darwin' ? 'kde' : 'mac';
    for (const [script, args] of [['scripts/pack.mjs', []], ['scripts/install.mjs', []], ['scripts/install.mjs', ['--uninstall']]]) {
      const result = spawnSync(process.execPath, [script, `--platform=${foreignPlatform}`, ...args], { cwd: resolve('.'), env, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /目前要求/);
    }
    await assert.rejects(access(marker), { code: 'ENOENT' });
    const supportedPlatform = { linux: 'kde', darwin: 'mac' }[process.platform];
    if (supportedPlatform) {
      const failedBuild = spawnSync(process.execPath, ['scripts/pack.mjs', `--platform=${supportedPlatform}`], { cwd: resolve('.'), env, encoding: 'utf8' });
      assert.equal(failedBuild.status, 1);
      assert.match(failedBuild.stderr, /Command failed/);
      assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), ['run', 'build']);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('KDE 模块保留安装产物、启动器、desktop 校验与卸载行为', { skip: process.platform !== 'linux' && '需要 Linux desktop 工具和 POSIX 启动器' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emd-install-'));
  try {
    const home = join(directory, "home with ' quote %");
    const source = join(directory, 'source');
    const commands = join(directory, 'commands');
    const data = join(directory, 'data');
    const state = join(directory, 'state');
    const calls = join(directory, 'calls');
    await mkdir(source); await mkdir(commands);
    await writeFile(join(source, 'emd'), '#!/bin/sh\nexit 0\n');
    for (const name of ['update-desktop-database', 'kbuildsycoca6']) await writeFile(join(commands, name), `#!/bin/sh\nprintf '%s\\n' '${name}' >> '${calls}'\n`, { mode: 0o755 });
    const env = { ...process.env, XDG_DATA_HOME: data, XDG_STATE_HOME: state, XDG_CURRENT_DESKTOP: 'KDE', PATH: `${commands}:${process.env.PATH}` };
    const context = JSON.stringify({ root: resolve('.'), home, source });
    execFileSync(process.execPath, ['--input-type=module', '-e', "import { install } from './scripts/platforms/kde.mjs'; await install(JSON.parse(process.argv[1]));", context], { env });
    const launcher = join(home, '.local/bin/emd');
    assert.ok((await stat(join(data, 'emd/emd'))).mode & 0o111);
    execFileSync('/bin/sh', ['-n', launcher]);
    assert.match(await readFile(launcher, 'utf8'), /setsid .*"\$@"/);
    const desktop = await readFile(join(data, 'applications/io.github.yceachan.emd.desktop'), 'utf8');
    assert.ok(desktop.includes('%%'));
    assert.match(desktop, /MimeType=text\/markdown;text\/x-markdown;text\/html;/);
    assert.ok((await stat(join(data, 'icons/hicolor/256x256/apps/io.github.yceachan.emd.png'))).size > 0);
    await writeFile(join(state, 'emd/emd.log'), '日志保留');
    execFileSync(process.execPath, ['--input-type=module', '-e', "import { uninstall } from './scripts/platforms/kde.mjs'; await uninstall(JSON.parse(process.argv[1]));", context], { env });
    for (const file of [launcher, join(data, 'emd'), join(data, 'applications/io.github.yceachan.emd.desktop')]) await assert.rejects(access(file), { code: 'ENOENT' });
    assert.equal(await readFile(join(state, 'emd/emd.log'), 'utf8'), '日志保留');
    assert.deepEqual((await readFile(calls, 'utf8')).trim().split('\n'), ['update-desktop-database', 'kbuildsycoca6', 'update-desktop-database', 'kbuildsycoca6']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
