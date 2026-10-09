const { expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test, launch, close } = require('./electron-fixture.cjs');
const { nativeDriver, hwnd } = require('./windows-native.cjs');

test('Windows 原生标题栏按钮命中、拖动区域、最大化还原与分屏尺寸', async () => {
  test.skip(process.platform !== 'win32', '需要 Windows 原生窗口');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-window-'));
  let application, driver;
  try {
    const file = path.join(directory, '正文.md'); await fs.writeFile(file, '# 分屏阅读\n\n正文。');
    application = await launch({ args: [path.resolve('.'), `--user-data-dir=${path.join(directory, 'profile')}`, file] });
    const page = await application.firstWindow();
    await expect(page.locator('.vp-doc h1')).toHaveText('分屏阅读');
    await expect(page.locator('.window-controls')).toHaveCount(0);
    driver = await nativeDriver();
    const handle = await hwnd(application);
    const titlebar = await page.evaluate(() => {
      const overlay = navigator.windowControlsOverlay;
      const rect = overlay.getTitlebarAreaRect();
      return { visible: overlay.visible, x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewport: innerWidth };
    });
    expect(titlebar.visible).toBe(true);
    expect(titlebar.height).toBe(56);
    // WCO's native caption buttons are 46 DIP each, right of the titlebar area.
    expect((await driver.run('hit', handle, titlebar.viewport - 69, 28)).hit).toBe(9); // HTMAXBUTTON
    const drag = await page.locator('.toolbar-path').boundingBox();
    expect((await driver.run('hit', handle, drag.x + drag.width / 2, drag.y + drag.height / 2)).hit).toBe(2); // HTCAPTION
    const before = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    await driver.run('maximize', handle);
    await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
    await driver.run('restore', handle);
    await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(before);
    for (const width of [500, 400, 330]) {
      await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 440), width);
      await expect.poll(async () => Math.abs((await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[0])) - width)).toBeLessThanOrEqual(1);
      await expect.poll(() => page.locator('.toolbar').evaluate(element => [...element.querySelectorAll('button')].every(button => {
        const rect = button.getBoundingClientRect(); return rect.x >= 0 && rect.right <= innerWidth;
      }))).toBe(true);
      await expect(page.locator('.vp-doc h1')).toBeVisible();
      expect(await page.locator('.reading-area').evaluate(element => element.clientWidth)).toBeGreaterThan(0);
    }
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMinimumSize())).toEqual([330, 240]);
  } finally { if (application) await close(application); if (driver) await driver.dispose(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('Windows 原生应用 GUI 取消与选择结果持久化', async () => {
  test.skip(process.platform !== 'win32', '需要 Windows 原生应用选择窗口');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-native-choice-'));
  let application, driver;
  try {
    application = await launch({ args: [path.resolve('.'), `--user-data-dir=${path.join(directory, 'profile')}`] });
    const page = await application.firstWindow();
    await expect(page.getByRole('button', { name: '打开 Markdown / HTML' })).toBeVisible();
    driver = await nativeDriver();
    const handle = await hwnd(application);
    for (const action of ['cancel', 'select']) {
      await page.evaluate(() => { window.choice = null; void window.emd.chooseEditor('markdown').then(value => { window.choice = value; }); });
      const result = await driver.run(action, handle);
      await expect.poll(() => page.evaluate(() => window.choice !== null)).toBe(true);
      const settings = await page.evaluate(() => window.emd.settings());
      if (action === 'cancel') expect(settings.editors.markdown).toBeNull();
      else {
        expect(result.chosen).toContain(settings.editors.markdown.program);
        expect(await fs.readFile(path.join(directory, 'profile/setting.toml'), 'utf8')).toContain('[editors.markdown]');
      }
      expect(settings.editors.html).toBeNull();
    }
  } finally { if (application) await close(application); if (driver) await driver.dispose(); await fs.rm(directory, { recursive: true, force: true }); }
});
