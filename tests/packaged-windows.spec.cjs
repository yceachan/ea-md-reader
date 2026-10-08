const { test, expect } = require('@playwright/test');
const { launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { nativeDriver, hwnd } = require('./windows-native.cjs');

test('Windows 原生包、隔离安装、二次启动打开、升级与重复卸载', async () => {
  test.skip(process.platform !== 'win32', '需要原生 Windows 打包产物');
  const { install, uninstall } = await import('../scripts/platforms/windows.mjs');
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-packaged-')));
  const home = path.join(directory, 'isolated home');
  const env = {
    ...process.env,
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    APPDATA: path.join(home, 'AppData', 'Roaming'),
  };
  const namespace = `Software\\ea-md-reader-tests\\packaged-${randomUUID().replaceAll('-', '')}`;
  const integration = path.resolve('tests/windows-packaged-integration.ps1');
  const context = { root: path.resolve('.'), home, env, run(command, args, options) {
    const isolatedArgs = [...args]; isolatedArgs[isolatedArgs.indexOf('-File') + 1] = integration;
    return execFileSync(command, [...isolatedArgs, namespace], options);
  } };
  const target = path.join(env.LOCALAPPDATA, 'Programs', 'emd');
  const executable = path.join(target, 'emd.exe');
  const profile = path.join(directory, 'profile');
  const first = path.join(directory, '只读 示例.md');
  const second = path.join(directory, '二次启动.md');
  const bytes = Buffer.from('\ufeff# Windows 原生包\r\n\r\n只读内容。\r\n');
  let application, driver;
  try {
    await fs.writeFile(first, bytes);
    await fs.writeFile(second, '# 二次启动\n');
    await install(context);
    application = await launch({ executablePath: executable, args: [`--user-data-dir=${profile}`, first] });
    const page = await application.firstWindow();
    await expect(page.locator('.vp-doc h1')).toHaveText('Windows 原生包');
    await expect(page.locator('.window-controls')).toHaveCount(0);
    expect(await page.evaluate(() => navigator.windowControlsOverlay.visible)).toBe(true);
    const chooser = path.join(target, 'resources/emd-application-chooser.exe');
    expect(Array.isArray(JSON.parse((await execFile(chooser, ['list', '.html'], { windowsHide: true })).stdout))).toBe(true);
    driver = await nativeDriver();
    const handle = await hwnd(application);
    await page.evaluate(() => { window.choiceFinished = false; void window.emd.chooseEditor('html').then(() => { window.choiceFinished = true; }); });
    await driver.run('cancel', handle);
    await expect.poll(() => page.evaluate(() => window.choiceFinished)).toBe(true);
    expect((await page.evaluate(() => window.emd.settings())).editors.html).toBeNull();
    expect(await application.evaluate(() => process.arch)).toBe(process.arch);
    await execFile(executable, [`--user-data-dir=${profile}`, second], { env });
    await expect(page.locator('.document-panel:not([hidden]) h1')).toHaveText('二次启动');
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath('packaged-windows.png') });
    await close(application);
    application = null;

    await fs.writeFile(path.join(target, 'obsolete'), 'old');
    await install(context);
    await assert.rejects(fs.access(path.join(target, 'obsolete')), { code: 'ENOENT' });
    const archives = await fs.readdir('release');
    expect(archives.some((name) => name.endsWith('-win-x64.exe'))).toBe(true);
    expect(archives.some((name) => name.endsWith('-win-x64.zip'))).toBe(true);
    await uninstall(context);
    await uninstall(context);
    expect(await fs.readFile(first)).toEqual(bytes);
    await assert.rejects(fs.access(target), { code: 'ENOENT' });
  } finally {
    try { if (application) await close(application); }
    finally {
      try { await uninstall(context); }
      finally {
        try { if (driver) await driver.dispose(); }
        finally {
          try { await execFile('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', integration, 'cleanup', 'unused', 'unused', namespace], { windowsHide: true }); }
          finally { await fs.rm(directory, { recursive: true, force: true }); }
        }
      }
    }
  }
});
