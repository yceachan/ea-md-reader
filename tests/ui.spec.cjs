const { test, expect } = require('@playwright/test');
const { launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const platformArgs = process.platform === 'linux' ? ['--ozone-platform=x11'] : [];

test('多标签滚轮纵向输入横向移动，无原生滚动条且活动标签可见', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-tabs-ui-'));
  let application;
  try {
    const files = Array.from({ length: 14 }, (_, index) => path.join(directory, `第${index + 1}份很长的阅读文档.md`));
    await Promise.all(files.map((file) => fs.writeFile(file, '# 正文\n')));
    application = await launch({ args: [path.resolve('.'), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`, ...files] });
    const page = await application.firstWindow();
    await expect(page.getByRole('tab')).toHaveCount(files.length);
    const bar = page.locator('.tabbar');
    await bar.evaluate((element) => { element.scrollLeft = 0; });
    await bar.hover();
    await page.mouse.wheel(0, 320);
    await expect.poll(() => bar.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.mouse.wheel(0, -1000);
    await expect.poll(() => bar.evaluate((element) => element.scrollLeft)).toBe(0);
    await page.evaluate(() => window.emd.command('previousTab'));
    await expect.poll(() => page.getByRole('tab', { selected: true }).evaluate((element) => {
      const item = element.getBoundingClientRect(), bar = element.closest('.tabbar').getBoundingClientRect();
      return item.left >= bar.left - 1 && item.right <= bar.right + 1;
    })).toBe(true);
    for (const factor of [1, 1.25, 1.5, 2]) {
      await application.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), factor);
      await expect.poll(() => bar.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
      expect(await bar.evaluate((element) => [getComputedStyle(element).scrollbarWidth, getComputedStyle(element).overflowY])).toEqual(['none', 'hidden']);
      expect(await page.locator('.reading-area').evaluate((element) => Math.abs(element.clientHeight - element.querySelector('.document-panel:not([hidden])').clientHeight))).toBeLessThanOrEqual(1);
    }
  } finally {
    if (application) await close(application);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('面板初始隐藏，窄屏覆盖层互斥且不改变正文，空白菜单重载工作树', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-panels-ui-')));
  let application;
  try {
    const sourceDirectory = path.join(directory, '工作树');
    await fs.mkdir(sourceDirectory);
    const file = path.join(sourceDirectory, '正文.md');
    await fs.writeFile(file, `# 正文\n\n${'段落\n\n'.repeat(60)}## 末尾标题\n`);
    application = await launch({ args: [path.resolve('.'), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`, file] });
    const page = await application.firstWindow();
    await expect(page.locator('.vp-doc h1')).toHaveText('正文');
    await expect(page.locator('.workspace-sidebar')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '本文目录' })).toHaveCount(0);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(620, 650));
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(620);
    const before = await page.locator('.reading-area').boundingBox();
    await page.getByRole('button', { name: '显示工作区', exact: true }).click();
    await expect(page.locator('.workspace-sidebar.panel-overlay')).toBeVisible();
    expect(await page.locator('.reading-area').boundingBox()).toEqual(before);
    await expect(page.locator('.workspace-sidebar .sidebar-header')).toHaveCount(0);
    await application.evaluate(({ Menu }) => {
      const original = Menu.buildFromTemplate;
      global.blankMenuCount = 0;
      Menu.buildFromTemplate = (template) => { const menu = original(template); menu.popup = () => { global.blankMenu = menu; global.blankMenuCount++; }; return menu; };
    });
    await page.locator('.workspace-sidebar .sidebar-scroll').click({ button: 'right', position: { x: 50, y: 250 } });
    await expect.poll(() => application.evaluate(() => global.blankMenu?.items.map((item) => item.label))).toEqual(['重新载入工作树']);
    await fs.writeFile(path.join(sourceDirectory, '新文件.md'), '# 新文件');
    await application.evaluate(() => global.blankMenu.items[0].click());
    await expect(page.getByRole('treeitem', { name: 'MD 新文件.md' })).toBeVisible();
    const moved = `${sourceDirectory}-暂存`;
    await fs.rename(sourceDirectory, moved);
    await application.evaluate(() => global.blankMenu.items[0].click());
    await expect(page.locator('.workspace-sidebar').getByRole('alert')).toContainText('ENOENT');
    await page.locator('.workspace-sidebar .sidebar-scroll').click({ button: 'right', position: { x: 50, y: 250 } });
    await expect.poll(() => application.evaluate(() => global.blankMenuCount)).toBe(2);
    await fs.rename(moved, sourceDirectory);
    await application.evaluate(() => global.blankMenu.items[0].click());
    await expect(page.getByRole('treeitem', { name: 'MD 新文件.md' })).toBeVisible();
    await page.getByRole('button', { name: '显示目录', exact: true }).click();
    await expect(page.locator('.workspace-sidebar')).toHaveCount(0);
    await expect(page.locator('.outline.panel-overlay')).toBeVisible();
    expect(await page.locator('.reading-area').boundingBox()).toEqual(before);
    await page.getByRole('navigation', { name: '本文目录' }).getByRole('button', { name: '末尾标题', exact: true }).click();
    await expect(page.getByRole('navigation', { name: '本文目录' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '显示目录', exact: true })).toBeFocused();
    await expect.poll(() => page.locator('.document-panel:not([hidden])').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.getByRole('button', { name: '显示工作区', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.workspace-sidebar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '显示工作区', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '显示工作区', exact: true }).click();
    await page.getByRole('treeitem', { name: 'MD 新文件.md' }).click();
    await expect(page.locator('.vp-doc h1')).toHaveText('新文件');
    await expect(page.locator('.workspace-sidebar')).toHaveCount(0);
  } finally {
    if (application) await close(application);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('设置两处入口共用弹窗，编辑器选择、取消、清除与持久化', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-settings-ui-')));
  let application;
  try {
    application = await launch({ args: [path.resolve('.'), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`] });
    const page = await application.firstWindow();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    await expect(dialog.locator('.editor-setting')).toHaveCount(2);
    const executable = await fs.realpath(process.execPath);
    await application.evaluate(({ dialog }, executable) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [executable] }); }, executable);
    await dialog.getByRole('button', { name: '选择程序…' }).first().click();
    await expect(dialog.locator('.editor-setting').first()).toContainText(executable);
    await application.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await dialog.getByRole('button', { name: '选择程序…' }).last().click();
    await expect(dialog.locator('.editor-setting').last()).toContainText('未配置');
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByRole('button', { name: '文件', exact: true }).click();
    await page.getByRole('menuitem', { name: '设置…' }).click();
    await expect(dialog.locator('.editor-setting').first()).toContainText(executable);
    expect(await fs.readFile(path.join(directory, 'profile', 'setting.toml'), 'utf8')).toContain('[editors.markdown]');
    await dialog.getByRole('button', { name: '清除 Markdown 编辑器' }).click();
    await expect(dialog.locator('.editor-setting').first()).toContainText('未配置');
  } finally {
    if (application) await close(application);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
