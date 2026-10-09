const { expect } = require('@playwright/test');
const { test, launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { windowGeometry } = require('./kde-fixture.cjs');
const native = process.env.EMD_NATIVE_KDE === '1';
const packaged = process.env.EMD_PACKAGED === '1';
const executablePath = packaged ? path.resolve(process.platform === 'win32' ? 'release/win-unpacked/emd.exe' : 'release/linux-unpacked/emd') : undefined;
const applicationArgs = packaged ? [] : [path.resolve('.')];
const args = process.platform === 'linux' ? native ? ['--ozone-platform=wayland'] : ['--ozone-platform=x11'] : [];
const env = { ...process.env, XDG_CURRENT_DESKTOP: 'KDE', XDG_SESSION_TYPE: native ? 'wayland' : 'x11', WAYLAND_DISPLAY: native ? process.env.WAYLAND_DISPLAY : '' };

test('KDE/Windows 专注启动按 pwd 当前层统一计数，零/单/多文档布局与欢迎页工作树正确', async () => {
  test.skip(!['linux', 'win32'].includes(process.platform), '当前平台未实现专注启动布局');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-startup-ui-')));
  try {
    for (const count of [0, 1, 2]) {
      const directory = path.join(root, `case-${count}`), profile = path.join(directory, 'profile');
      await fs.mkdir(profile, { recursive: true });
      await fs.mkdir(path.join(directory, 'nested')); await fs.writeFile(path.join(directory, 'nested', 'ignored.md'), '# 子层不计数');
      await fs.writeFile(path.join(profile, 'setting.toml'), '[startup]\nlayout="focus"\n');
      const html = path.join(directory, 'only.HTML');
      if (count >= 1) await fs.writeFile(html, '<h1>HTML 单文档</h1>');
      if (count === 2) await fs.writeFile(path.join(directory, '正文.md'), '# 工作树正文');
      let application;
      try {
        application = await launch({ executablePath, cwd: directory, env, args: [...applicationArgs, ...args, `--user-data-dir=${profile}`, ...(count === 1 ? [html] : [])] });
        const page = await application.firstWindow();
        if (count === 1) await expect(page.getByRole('tab')).toHaveCount(1);
        else await expect(page.getByRole('button', { name: '打开 Markdown / HTML' })).toBeVisible();
        const area = await application.evaluate(({ screen }, native) => native ? screen.getAllDisplays()[0].workArea : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, native);
        const wanted = count === 0 ? Math.min(1180, area.width) : count === 1 ? Math.min(620, area.width) : Math.floor(area.width / 2);
        await expect.poll(async () => Math.abs((await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[0])) - wanted)).toBeLessThanOrEqual(1);
        await expect.poll(async () => Math.abs((await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[1])) - (count === 0 ? Math.min(850, area.height) : area.height))).toBeLessThanOrEqual(1);
        if (process.platform === 'win32') {
          const bounds = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
          expect(Math.abs(bounds.x - (count === 0 ? Math.round(area.x + (area.width - wanted) / 2) : area.x + area.width - wanted))).toBeLessThanOrEqual(1);
          expect(Math.abs(bounds.y - (count === 0 ? Math.round(area.y + (area.height - Math.min(850, area.height)) / 2) : area.y))).toBeLessThanOrEqual(1);
        }
        if (native) {
          const actual = await windowGeometry(application);
          expect(actual.output).toBe(actual.pointerOutput);
          expect(actual.geometry).toEqual(count === 0
            ? { x: Math.round(actual.area.x + (actual.area.width - 1180) / 2), y: Math.round(actual.area.y + (actual.area.height - 850) / 2), width: 1180, height: 850 }
            : { x: Math.round(actual.area.x + actual.area.width - wanted), y: Math.round(actual.area.y), width: wanted, height: Math.floor(actual.area.height) });
        }
        if (count === 2) {
          await expect(page.locator('.workspace-sidebar')).toBeVisible();
          if (process.platform === 'linux') await expect(page.locator('.workspace-sidebar.panel-overlay')).toHaveCount(0);
          const overlay = await page.locator('.workspace-sidebar').evaluate(element => element.classList.contains('panel-overlay'));
          const panel = await page.locator('.workspace-sidebar').boundingBox();
          expect(panel.x).toBeGreaterThanOrEqual(0);
          expect(panel.x + panel.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
          await expect(page.getByRole('treeitem', { name: 'MD 正文.md' })).toBeVisible();
          await page.getByRole('treeitem', { name: 'MD 正文.md' }).click();
          await expect(page.locator('.vp-doc h1')).toHaveText('工作树正文');
          if (overlay) await expect(page.locator('.workspace-sidebar')).toHaveCount(0);
          else await expect(page.locator('.workspace-sidebar')).toBeVisible();
        } else await expect(page.locator('.workspace-sidebar')).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: '本文目录' })).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);
      } finally { if (application) await close(application); }
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('默认布局尺寸受屏幕工作区限制并展开工作树和 TOC，折叠按钮悬浮且不划分内容列', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-default-layout-')));
  let application;
  try {
    const file = path.join(directory, '默认.md'); await fs.writeFile(file, '# 默认布局\n\n## 正文\n');
    application = await launch({ executablePath, cwd: directory, env, args: [...applicationArgs, ...args, `--user-data-dir=${path.join(directory, 'profile')}`, file] });
    const page = await application.firstWindow();
    await expect(page.locator('.workspace-sidebar')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '本文目录' })).toBeVisible();
    const area = await application.evaluate(({ BrowserWindow, screen }, native) => native ? screen.getAllDisplays()[0].workArea : screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).workArea, native);
    const size = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize());
    const expectedSize = [Math.floor(Math.min(1180, area.width)), Math.floor(Math.min(850, area.height))];
    // Openbox 在贴合工作区边界时可能保留 1px。
    for (let index = 0; index < expectedSize.length; index++) {
      if (process.platform !== 'win32') expect(size[index]).toBeLessThanOrEqual(expectedSize[index]);
      // Windows native frame sizes round to physical pixels at fractional DPI.
      expect(Math.abs(expectedSize[index] - size[index])).toBeLessThanOrEqual(1);
    }
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    await expect(page.locator('.outline.panel-overlay')).toHaveCount(viewportWidth <= area.width / 2 ? 1 : 0);
    const outline = await page.locator('.outline').boundingBox(), content = await page.locator('.outline-content').boundingBox();
    expect(content.x - outline.x).toBeLessThanOrEqual(1);
    expect(outline.width - content.width).toBeLessThanOrEqual(1);
    expect(await page.getByRole('button', { name: '折叠目录面板', exact: true }).evaluate(button => getComputedStyle(button).position)).toBe('absolute');
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { if (application) await close(application); await fs.rm(directory, { recursive: true, force: true }); }
});

test('KDE/Windows 设置保存默认/专注偏好，下次启动生效且保留编辑器配置', async () => {
  test.skip(!['linux', 'win32'].includes(process.platform), '当前平台未实现专注启动布局');
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-startup-preference-')));
  let application;
  try {
    const profile = path.join(directory, 'profile'); await fs.mkdir(profile);
    await fs.writeFile(path.join(profile, 'setting.toml'), `[editors.html]\nprogram=${JSON.stringify(process.execPath)}\n`);
    application = await launch({ executablePath, cwd: directory, env, args: [...applicationArgs, ...args, `--user-data-dir=${profile}`] });
    const page = await application.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    await expect(dialog.getByRole('radio', { name: '默认布局', exact: true })).toBeChecked();
    const before = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    await dialog.getByRole('radio', { name: '专注阅读模式', exact: true }).click();
    await expect(dialog.getByRole('radio', { name: '专注阅读模式', exact: true })).toBeChecked();
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(before);
    expect((await page.evaluate(() => window.emd.settings())).editors.html.program).toBe(process.execPath);
    expect(await fs.readFile(path.join(profile, 'setting.toml'), 'utf8')).toContain('layout = "focus"');
    await dialog.getByRole('radio', { name: '默认布局', exact: true }).click();
    await expect(dialog.getByRole('radio', { name: '默认布局', exact: true })).toBeChecked();
  } finally { if (application) await close(application); await fs.rm(directory, { recursive: true, force: true }); }
});
