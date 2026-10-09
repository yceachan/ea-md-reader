const { expect } = require('@playwright/test');
const { test, launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

test('macOS 原生包、隔离安装、系统打开、升级与重复卸载', async () => {
  test.skip(process.platform !== 'darwin', '需要原生 macOS 与 LaunchServices');
  const { install, uninstall } = await import('../scripts/platforms/mac.mjs');
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-packaged-')));
  const context = { root: path.resolve('.'), home: path.join(directory, 'isolated home') };
  const bundle = path.join(context.home, 'Applications/emd.app');
  const executable = path.join(bundle, 'Contents/MacOS/emd');
  const profile = path.join(directory, 'profile');
  const first = path.join(directory, '只读 示例.md');
  const second = path.join(directory, '系统打开.md');
  const third = path.join(directory, '-终端 参数.md');
  const html = path.join(directory, '系统 页面.html');
  const bytes = Buffer.from('\ufeff# 只读示例\r\n\r\n原始内容。\r\n');
  let application;
  try {
    await fs.writeFile(first, bytes);
    await fs.writeFile(second, '# 系统打开\n');
    await fs.writeFile(third, '# 终端参数\n');
    await fs.writeFile(html, '<!doctype html><h1>系统HTML</h1><button id="interactive">0</button><script>document.querySelector("button").onclick=e=>e.target.textContent="1"</script>');
    await install(context);
    await execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
    const archives = (await fs.readdir('release')).filter((name) => name.endsWith('.dmg'));
    expect(archives.length).toBe(1);
    await execFile('/usr/bin/hdiutil', ['verify', path.resolve('release', archives[0])]);
    application = await launch({ executablePath: executable, args: [`--user-data-dir=${profile}`, first] });
    const page = await application.firstWindow();
    await expect(page.locator('.vp-doc h1')).toHaveText('只读示例');
    expect(await application.evaluate(() => process.arch)).toBe(process.arch);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    await execFile('/usr/bin/open', ['-a', bundle, second, '--args', `--user-data-dir=${profile}`]);
    await expect(page.locator('.document-panel:not([hidden]) h1')).toHaveText('系统打开');
    await expect.poll(() => application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return window.isVisible() && window.isFocused();
    })).toBe(true);
    await execFile('/bin/sh', [path.join(context.home, '.local/bin/emd'), `--user-data-dir=${profile}`, '--', third]);
    await expect(page.locator('.document-panel:not([hidden]) h1')).toHaveText('终端参数');
    await expect(page.getByRole('tab')).toHaveCount(3);
    await execFile('/usr/bin/open', ['-a', bundle, html, '--args', `--user-data-dir=${profile}`]);
    const frame = page.frameLocator('.document-panel:not([hidden]) .html-page');
    await expect(frame.locator('h1')).toHaveText('系统HTML');
    await frame.locator('#interactive').click();
    await expect(frame.locator('#interactive')).toHaveText('1');
    expect(await frame.locator('body').evaluate(() => typeof window.emd)).toBe('undefined');
    await expect(page.getByRole('tab')).toHaveCount(4);
    await page.screenshot({ path: test.info().outputPath('system-open.png') });
    await close(application);
    application = null;
    await fs.writeFile(path.join(bundle, 'Contents/obsolete'), 'old');
    await install(context);
    await assert.rejects(fs.access(path.join(bundle, 'Contents/obsolete')), { code: 'ENOENT' });
    await execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
    await uninstall(context);
    await uninstall(context);
    expect(await fs.readFile(first)).toEqual(bytes);
    await assert.rejects(fs.access(bundle), { code: 'ENOENT' });
  } finally {
    try {
      if (application) await close(application);
    } finally {
      try {
        try {
          await test.info().attach('installed-launcher-log', {
            body: await fs.readFile(path.join(context.home, 'Library/Logs/emd/emd.log')),
            contentType: 'text/plain',
          });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      } finally {
        // The isolated install still has a system registration that must be removed on failure.
        try { await uninstall(context); }
        finally { await fs.rm(directory, { recursive: true, force: true }); }
      }
    }
  }
});
