const { test, expect } = require('@playwright/test');
const { launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { windowGeometry } = require('./kde-fixture.cjs');
const native = process.env.EMD_NATIVE_KDE === '1';
const packaged = process.env.EMD_PACKAGED === '1';
const executablePath = packaged ? path.resolve('release/linux-unpacked/emd') : undefined;
const applicationArgs = packaged ? [] : [path.resolve('.')];
const args = native ? ['--ozone-platform=wayland'] : ['--ozone-platform=x11'];
const env = { ...process.env, XDG_CURRENT_DESKTOP: 'KDE', XDG_SESSION_TYPE: native ? 'wayland' : 'x11', WAYLAND_DISPLAY: native ? process.env.WAYLAND_DISPLAY : '' };

test('KDE 专注启动按 pwd 当前层统一计数，零/单/多文档布局与欢迎页工作树正确', async () => {
  test.skip(process.platform !== 'linux', '其他平台启动布局 TODO');
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
        const wanted = count === 0 ? 1180 : count === 1 ? 620 : Math.floor(area.width / 2);
        await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[0])).toBe(wanted);
        await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()[1])).toBe(count === 0 ? 850 : area.height);
        if (native) {
          const actual = await windowGeometry(application);
          expect(actual.output).toBe(actual.pointerOutput);
          expect(actual.geometry).toEqual(count === 0
            ? { x: Math.round(actual.area.x + (actual.area.width - 1180) / 2), y: Math.round(actual.area.y + (actual.area.height - 850) / 2), width: 1180, height: 850 }
            : { x: Math.round(actual.area.x + actual.area.width - wanted), y: Math.round(actual.area.y), width: wanted, height: Math.floor(actual.area.height) });
        }
        if (count === 2) {
          await expect(page.locator('.workspace-sidebar')).toBeVisible();
          await expect(page.locator('.workspace-sidebar.panel-overlay')).toHaveCount(0);
          await expect(page.getByRole('treeitem', { name: 'MD 正文.md' })).toBeVisible();
          await page.getByRole('treeitem', { name: 'MD 正文.md' }).click();
          await expect(page.locator('.vp-doc h1')).toHaveText('工作树正文');
          await expect(page.locator('.workspace-sidebar')).toBeVisible();
        } else await expect(page.locator('.workspace-sidebar')).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: '本文目录' })).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);
      } finally { if (application) await close(application); }
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('默认布局保持尺寸并展开工作树和 TOC，折叠按钮悬浮且不划分内容列', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-default-layout-')));
  let application;
  try {
    const file = path.join(directory, '默认.md'); await fs.writeFile(file, '# 默认布局\n\n## 正文\n');
    application = await launch({ executablePath, cwd: directory, env, args: [...applicationArgs, ...args, `--user-data-dir=${path.join(directory, 'profile')}`, file] });
    const page = await application.firstWindow();
    await expect(page.locator('.workspace-sidebar')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '本文目录' })).toBeVisible();
    const screenWidth = await application.evaluate(({ screen }, native) => native ? screen.getAllDisplays()[0].workArea.width : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea.width, native);
    await expect(page.locator('.outline.panel-overlay')).toHaveCount(1180 <= screenWidth / 2 ? 1 : 0);
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())).toEqual([1180, 850]);
    const outline = await page.locator('.outline').boundingBox(), content = await page.locator('.outline-content').boundingBox();
    expect(content.x - outline.x).toBeLessThanOrEqual(1);
    expect(outline.width - content.width).toBeLessThanOrEqual(1);
    expect(await page.getByRole('button', { name: '折叠目录面板', exact: true }).evaluate(button => getComputedStyle(button).position)).toBe('absolute');
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { if (application) await close(application); await fs.rm(directory, { recursive: true, force: true }); }
});

test('KDE 设置保存默认/专注偏好，下次启动生效且保留编辑器配置', async () => {
  test.skip(process.platform !== 'linux', '其他平台启动布局 TODO');
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
