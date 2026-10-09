import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
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
