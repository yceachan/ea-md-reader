const { expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test, launch, close } = require('./electron-fixture.cjs');
const { nativeDriver, hwnd } = require('./windows-native.cjs');

test('Windows 11 Shell：最大化按钮悬停显示分屏菜单，拖至右边缘真实吸附', async () => {
  test.skip(process.platform !== 'win32' || process.env.EMD_WINDOWS_SHELL !== '1', '仅专用 Windows 11 CI 桌面执行');
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'self-hosted' || process.env.EMD_DEDICATED_WINDOWS_DESKTOP !== '1') throw new Error('缺少专用 CI 桌面声明。');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-shell-'));
  let application, driver;
  try {
    const file = path.join(directory, 'Shell 分屏.md'); await fs.writeFile(file, '# Shell 分屏');
    application = await launch({ args: [path.resolve('.'), `--user-data-dir=${path.join(directory, 'profile')}`, file] });
    const page = await application.firstWindow();
    await expect(page.locator('.vp-doc h1')).toHaveText('Shell 分屏');
    driver = await nativeDriver();
    const handle = await hwnd(application);
    const viewport = await page.evaluate(() => innerWidth);
    const menu = await driver.run('shell-hover', handle, viewport - 69, 28);
    expect(menu.menu).toBe(true);
    await test.info().attach('native-snap-menu', { body: JSON.stringify(menu, null, 2), contentType: 'application/json' });
    const drag = await page.locator('.toolbar-path').boundingBox();
    await driver.run('shell-drag', handle, drag.x + drag.width / 2, drag.y + drag.height / 2);
    await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isSnapped())).toBe(true);
    const { bounds, area } = await application.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()[0].getBounds(); return { bounds, area: screen.getDisplayMatching(bounds).workArea };
    });
    // Native resize borders can extend a few DIPs beyond the work area.
    expect(Math.abs(bounds.x + bounds.width - area.x - area.width)).toBeLessThanOrEqual(16);
    expect(bounds.width).toBeLessThanOrEqual(area.width / 2 + 16);
    await expect(page.locator('.vp-doc h1')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('shell-right-snap.png') });
  } finally { if (application) await close(application); if (driver) await driver.dispose(); await fs.rm(directory, { recursive: true, force: true }); }
});
