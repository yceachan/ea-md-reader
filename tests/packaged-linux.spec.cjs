const { expect } = require('@playwright/test');
const { test, launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

test('Linux 原生包安装、启动、升级与卸载，保留配置和源文件', async () => {
  test.skip(process.platform !== 'linux', '需要原生 Linux 打包产物');
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-packaged-')));
  const source = path.join(directory, '原生包.md');
  const bytes = Buffer.from('\ufeff# 原生包\r\n\r\n只读内容。\r\n');
  const { install, uninstall } = await import('../scripts/platforms/kde.mjs');
  const context = { root: path.resolve('.'), home: path.join(directory, 'home') };
  const previous = { XDG_DATA_HOME: process.env.XDG_DATA_HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME };
  process.env.XDG_DATA_HOME = path.join(directory, 'data');
  process.env.XDG_STATE_HOME = path.join(directory, 'state');
  const target = path.join(process.env.XDG_DATA_HOME, 'emd');
  const profile = path.join(directory, 'profile');
  async function installApp() {
    await install(context);
    // The Ubuntu runner requires a root-owned sandbox helper. A user-level
    // install copies it with the current uid, so configure this test copy too.
    const sandbox = path.join(target, 'chrome-sandbox');
    execFileSync('sudo', ['chown', 'root:root', sandbox]);
    execFileSync('sudo', ['chmod', '4755', sandbox]);
  }
  let application;
  try {
    await fs.writeFile(source, bytes);
    await installApp();
    application = await launch({
      executablePath: path.join(target, 'emd'),
      args: ['--ozone-platform=x11', `--user-data-dir=${profile}`, source],
    });
    const page = await application.firstWindow();
    await expect(page.locator('.vp-doc h1')).toHaveText('原生包');
    expect(await application.evaluate(() => process.arch)).toBe(process.arch);
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
    expect((await page.evaluate(() => window.emd.settings())).editors.markdown).toBeNull();
    const desktop = path.join(directory, '测试.desktop');
    await fs.writeFile(desktop, '[Desktop Entry]\nType=Application\nName=Test editor\nExec=/usr/bin/true %F\n', { mode: 0o644 });
    expect(await application.evaluate(({ app }, program) => {
      const require = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
      return require('./electron/platforms/linux.cjs').validateEditor(program);
    }, desktop)).toBe(desktop);
    const bounds = await page.locator('.reading-area').boundingBox();
    await application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith('emd://')).webContents;
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'F12' });
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'F12' });
    });
    await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.webContents.getURL().startsWith('devtools://') && window.isVisible()))).toBe(true);
    expect(await page.locator('.reading-area').boundingBox()).toEqual(bounds);
    await page.screenshot({ path: test.info().outputPath('packaged-linux.png') });
    await close(application);
    application = null;
    await fs.writeFile(path.join(target, 'obsolete'), 'old');
    await installApp();
    await assert.rejects(fs.access(path.join(target, 'obsolete')), { code: 'ENOENT' });
    application = await launch({
      executablePath: path.join(target, 'emd'),
      args: ['--ozone-platform=x11', `--user-data-dir=${profile}`, source],
    });
    await expect((await application.firstWindow()).locator('.vp-doc h1')).toHaveText('原生包');
    expect(await fs.readFile(source)).toEqual(bytes);
  } finally {
    try { if (application) await close(application); }
    finally {
      try { await uninstall(context); await uninstall(context); }
      finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
  }
});
