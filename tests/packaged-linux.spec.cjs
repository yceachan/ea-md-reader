const { expect } = require('@playwright/test');
const { test, launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('Linux 原生打包产物启动且源文件保持只读', async () => {
  test.skip(process.platform !== 'linux', '需要原生 Linux 打包产物');
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-packaged-')));
  const source = path.join(directory, '原生包.md');
  const bytes = Buffer.from('\ufeff# 原生包\r\n\r\n只读内容。\r\n');
  let application;
  try {
    await fs.writeFile(source, bytes);
    application = await launch({
      executablePath: path.resolve('release/linux-unpacked/emd'),
      args: ['--ozone-platform=x11', `--user-data-dir=${path.join(directory, 'profile')}`, source],
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
    expect(await fs.readFile(source)).toEqual(bytes);
  } finally {
    if (application) await close(application);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
