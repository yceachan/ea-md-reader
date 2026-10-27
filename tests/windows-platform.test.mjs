import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { install, packOptions, uninstall } from '../scripts/platforms/windows.mjs';

async function missing(file) {
  await assert.rejects(access(file), { code: 'ENOENT' });
}

async function fixture(t) {
  // Hosted runners expose TEMP through RUNNER~1; Shell links expand 8.3 aliases.
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'emd-windows-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, 'home');
  const root = resolve('.');
  const source = join(directory, 'source');
  const localAppData = join(home, 'AppData', 'Local');
  const appData = join(home, 'AppData', 'Roaming');
  const target = join(localAppData, 'Programs', 'emd');
  const executable = join(target, 'emd.exe');
  const shortcut = join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'emd.lnk');
  const calls = [];
  const run = (command, args, options) => calls.push({ command, args, options });
  await mkdir(join(source, 'resources'), { recursive: true });
  await writeFile(join(source, 'emd.exe'), 'version one');
  await writeFile(join(source, 'resources', 'app.asar'), 'package');
  return {
    directory, home, root, source, localAppData, appData, target, executable, shortcut, calls, run,
    env: { SystemRoot: 'C:\\Windows', LOCALAPPDATA: localAppData, APPDATA: appData },
  };
}

test('Windows 打包生成应用目录、NSIS 安装器与 ZIP', () => {
  assert.deepEqual(packOptions.win, ['dir', 'nsis', 'zip']);
  assert.equal(packOptions.config.win.icon, 'assets/emd.png');
  assert.equal(packOptions.config.nsis.perMachine, false);
  assert.equal(packOptions.config.nsis.include, 'scripts/platforms/windows-associations.nsh');
  assert.equal(packOptions.config.fileAssociations, undefined);
});

test('Windows 打包前初始化 Electron，初始化失败时停止打包', async t => {
  const { directory, root } = await fixture(t);
  await cp(join(root, 'scripts/platforms/windows.mjs'), join(directory, 'windows.mjs'));
  const electron = join(directory, 'node_modules/electron');
  await mkdir(electron, { recursive: true });
  await writeFile(join(electron, 'package.json'), '{"main":"index.cjs"}');
  await writeFile(join(electron, 'index.cjs'), `
    const fs = require('node:fs'), path = require('node:path');
    if (fs.existsSync(path.join(__dirname, 'fail'))) throw new Error('runtime download failed');
    fs.mkdirSync(path.join(__dirname, 'dist'));
    fs.writeFileSync(path.join(__dirname, 'dist/electron.exe'), 'runtime');
    module.exports = path.join(__dirname, 'dist/electron.exe');
  `);
  const probe = join(directory, 'pack.mjs');
  await writeFile(probe, `
    import { access } from 'node:fs/promises';
    import { packOptions } from './windows.mjs';
    await packOptions.config.beforePack();
    await access(new URL('./' + packOptions.config.electronDist + '/electron.exe', import.meta.url));
  `);
  await writeFile(join(electron, 'fail'), 'fail');
  assert.throws(() => execFileSync(process.execPath, [probe], { stdio: 'pipe' }), /runtime download failed/);
  await missing(join(electron, 'dist'));
  await rm(join(electron, 'fail'));
  execFileSync(process.execPath, [probe], { stdio: 'pipe' });
  assert.equal(await readFile(join(electron, 'dist/electron.exe'), 'utf8'), 'runtime');
});

test('Windows 直接复制已安装的 Electron，清理示例资源并保留运行时文件', async t => {
  const { source } = await fixture(t);
  assert.equal(packOptions.config.electronDist, 'node_modules/electron/dist');
  await writeFile(join(source, 'resources', 'default_app.asar'), 'Electron sample');
  await writeFile(join(source, 'version'), '44.5.1');
  await packOptions.config.afterExtract({ appOutDir: source });
  await missing(join(source, 'resources', 'default_app.asar'));
  await missing(join(source, 'version'));
  assert.equal(await readFile(join(source, 'emd.exe'), 'utf8'), 'version one');
  assert.equal(await readFile(join(source, 'resources', 'app.asar'), 'utf8'), 'package');
});

test('Windows 用户级安装支持升级、重复卸载并保留配置', async t => {
  const context = await fixture(t);
  await install(context);
  assert.equal(await readFile(context.executable, 'utf8'), 'version one');
  assert.deepEqual(context.calls.map(({ args }) => args.at(-3)), ['validate', 'install']);
  assert.equal(context.calls[0].command, 'pwsh.exe');
  assert.deepEqual(context.calls[0].args.slice(-2), [context.executable, context.shortcut]);

  await writeFile(join(context.target, 'obsolete'), 'old');
  await writeFile(join(context.source, 'emd.exe'), 'version two');
  await install(context);
  assert.equal(await readFile(context.executable, 'utf8'), 'version two');
  await missing(join(context.target, 'obsolete'));

  const profile = join(context.appData, 'emd', 'setting.toml');
  await mkdir(join(context.appData, 'emd'), { recursive: true });
  await writeFile(profile, '[profile]\nname="retained"\n');
  await uninstall(context);
  await uninstall(context);
  await missing(context.target);
  assert.match(await readFile(profile, 'utf8'), /retained/);
  assert.deepEqual(context.calls.slice(-2).map(({ args }) => args.at(-3)), ['uninstall', 'uninstall']);
});

test('Windows 升级等待真实文件锁释放，持续占用时保留旧应用并报错', { skip: process.platform !== 'win32' }, async t => {
  const context = await fixture(t);
  await install(context);
  const locker = spawn('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `
    $stream = [IO.File]::Open($env:EMD_LOCK_TARGET, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try { [Console]::Out.WriteLine('locked'); [Console]::Out.Flush(); [Console]::In.ReadLine() | Out-Null }
    finally { $stream.Dispose() }
  `], { windowsHide: true, env: { ...process.env, EMD_LOCK_TARGET: context.executable }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (locker.exitCode === null) locker.kill(); });
  const closed = once(locker, 'close');
  await Promise.race([
    once(locker.stdout, 'data').then(([data]) => assert.match(data.toString(), /locked/)),
    closed.then(([code]) => { throw new Error(`File locker exited before readiness: ${code}`); }),
  ]);
  await writeFile(join(context.source, 'emd.exe'), 'version two');
  await assert.rejects(install(context), { code: 'EPERM' });
  assert.equal(await readFile(context.executable, 'utf8'), 'version one');
  assert.equal(context.calls.filter(({ args }) => args.at(-3) === 'install').length, 1);
  // CI retained the lock beyond the old 3.1 s retry window after app close.
  const release = setTimeout(() => locker.stdin.end('\n'), 4000);
  try { await install(context); }
  finally { clearTimeout(release); locker.stdin.end(); }
  await closed;
  assert.equal(await readFile(context.executable, 'utf8'), 'version two');
});

test('Windows 安装拒绝异物目标和快捷方式冲突', async t => {
  const context = await fixture(t);
  await mkdir(context.target, { recursive: true });
  await writeFile(context.executable, 'foreign app');
  await assert.rejects(install(context), /其他应用/);
  assert.equal(await readFile(context.executable, 'utf8'), 'foreign app');
  assert.equal(context.calls.length, 0);

  await rm(context.target, { recursive: true });
  const conflict = { ...context, run(command, args) {
    if (args.at(-3) === 'validate') throw new Error('foreign shortcut');
  } };
  await assert.rejects(install(conflict), /foreign shortcut/);
  await missing(context.target);
});

test('Windows 集成写入失败时恢复旧版本', async t => {
  const context = await fixture(t);
  await install(context);
  await writeFile(join(context.target, 'retained'), 'old version');
  await writeFile(join(context.source, 'emd.exe'), 'version two');
  let failed = false;
  const run = (command, args, options) => {
    context.calls.push({ command, args, options });
    if (args.at(-3) === 'install' && !failed) { failed = true; throw new Error('registry failed'); }
  };
  await assert.rejects(install({ ...context, run }), /registry failed/);
  assert.equal(await readFile(context.executable, 'utf8'), 'version one');
  assert.equal(await readFile(join(context.target, 'retained'), 'utf8'), 'old version');
  assert.deepEqual(context.calls.slice(-2).map(({ args }) => args.at(-3)), ['validate', 'install']);
});

test('Windows 实际注册表和快捷方式集成：隔离 HKCU、默认应用保护和失败回滚', { skip: process.platform !== 'win32' }, async t => {
  const context = await fixture(t);
  execFileSync('pwsh.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', resolve('tests/windows-integration.test.ps1'), context.directory,
  ], { stdio: 'pipe', encoding: 'utf8', windowsHide: true, timeout: 30000 });
});
