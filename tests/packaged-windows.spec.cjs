const { test, expect } = require('@playwright/test');
const { launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

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
  const context = { root: path.resolve('.'), home, env };
  const target = path.join(env.LOCALAPPDATA, 'Programs', 'emd');
  const executable = path.join(target, 'emd.exe');
  const profile = path.join(directory, 'profile');
  const first = path.join(directory, '只读 示例.md');
  const second = path.join(directory, '二次启动.md');
  const bytes = Buffer.from('\ufeff# Windows 原生包\r\n\r\n只读内容。\r\n');
  let application;
  try {
    await fs.writeFile(first, bytes);
    await fs.writeFile(second, '# 二次启动\n');
    await install(context);
    application = await launch({ executablePath: executable, args: [`--user-data-dir=${profile}`, first] });
    const page = await application.firstWindow();
    await expect(page.locator('.vp-doc h1')).toHaveText('Windows 原生包');
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
      finally { await fs.rm(directory, { recursive: true, force: true }); }
    }
  }
});
