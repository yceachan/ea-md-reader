const { test, expect } = require('@playwright/test');
const { launch, close, chooseEditor } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const platformArgs = process.platform === 'linux' ? ['--ozone-platform=x11'] : [];

test('logo 打开居中 profile，头像与三行导航读取 TOML，链接交给系统且重开读取更新', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-profile-ui-')));
  let application;
  try {
    const avatar = path.join(directory, '无扩展名头像');
    await fs.writeFile(avatar, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));
    const photo = 'profile-photo.jpg';
    const config = path.join(directory, 'setting.toml');
    const text = `[editors.html]\nprogram=${JSON.stringify(process.execPath)}\n[profile]\nname="yceachan"\ntagline="As Eachan's Views"\nemail="yceachan@foxmail.com"\ngithub="https://github.com/yceachan"\nrepository="https://github.com/yceachan/ea-md-reader"\ncopyright="copyright (c) 2026 yceachan"\nlicense="MIT LICENSE"\nprofile-photo=${JSON.stringify(photo)}\n`;
    await fs.writeFile(config, text);
    const packaged = process.env.EMD_PACKAGED === '1';
    application = await launch({ executablePath: packaged ? path.resolve('release/linux-unpacked/emd') : undefined, args: [...(packaged ? [] : [path.resolve('.')]), ...platformArgs, `--user-data-dir=${directory}`] });
    const page = await application.firstWindow();
    const trigger = page.getByRole('button', { name: '个人资料', exact: true });
    await trigger.click();
    const card = page.getByRole('dialog', { name: '个人资料', exact: true });
    await expect(card.getByRole('heading', { name: 'yceachan' })).toBeVisible();
    await expect.poll(() => card.getByRole('img').evaluate((image) => image.naturalWidth)).toBe(512);
    await expect(card.getByRole('link')).toHaveCount(3);
    await expect(card.getByRole('link').nth(2)).toHaveText('yceachan/ea-md-reader');
    await expect(card.locator('.profile-footer')).toContainText('copyright (c) 2026 yceachan');
    await expect(card.locator('.profile-license')).toHaveText('MIT LICENSE');
    const box = await card.boundingBox(), viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
    await card.screenshot({ path: test.info().outputPath('profile-card.png') });
    await application.evaluate(({ shell }) => { global.profileLinks = []; shell.openExternal = async (url) => { global.profileLinks.push(url); }; });
    for (const link of await card.getByRole('link').all()) await link.click();
    expect(await application.evaluate(() => global.profileLinks)).toEqual(['mailto:yceachan@foxmail.com', 'https://github.com/yceachan', 'https://github.com/yceachan/ea-md-reader']);
    await page.evaluate(() => window.emd.profileLink('invalid'));
    await expect(card.getByRole('alert')).toContainText('无效的资料链接');
    expect(await application.evaluate(() => global.profileLinks.length)).toBe(3);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0); await expect(trigger).toBeFocused();
    await page.evaluate(() => window.emd.clearEditor('html'));
    expect(await fs.readFile(config, 'utf8')).toContain('As Eachan');
    await fs.writeFile(config, text.replace("As Eachan's Views", '更新后的简介').replace(JSON.stringify(photo), JSON.stringify(avatar)));
    await trigger.click(); await expect(card).toContainText('更新后的简介');
    await expect.poll(() => card.getByRole('img').evaluate((image) => image.naturalWidth)).toBe(1);
    await card.getByRole('button', { name: '关闭个人资料' }).click();
    await fs.writeFile(config, text.replace(JSON.stringify(photo), JSON.stringify(path.join(directory, 'missing-photo'))));
    await trigger.click(); await expect(card.getByRole('alert')).toContainText('ENOENT');
  } finally { if (application) await close(application); await fs.rm(directory, { recursive: true, force: true }); }
});

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

test('默认展开双面板，窄屏覆盖层互斥且不改变正文，空白菜单重载工作树', async () => {
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
    await expect(page.locator('.workspace-sidebar')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '本文目录' })).toBeVisible();
    const dock = page.getByRole('button', { name: '折叠目录面板', exact: true });
    const dockBox = await dock.boundingBox(), panelBox = await page.locator('.outline').boundingBox();
    expect(Math.abs(dockBox.x + dockBox.width - panelBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(dockBox.y + dockBox.height / 2 - panelBox.y - panelBox.height / 2)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath('toc-dock-expanded.png') });
    await page.getByRole('button', { name: '显示工作区', exact: true }).click();
    await page.getByRole('button', { name: '显示目录', exact: true }).click();
    await expect(page.locator('.workspace-sidebar')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '本文目录' })).toHaveCount(0);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(620, 650));
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(620);
    const toolbarFits = () => page.locator('.toolbar').evaluate((element) => [...element.querySelectorAll('button')].every((button) => {
      const box = button.getBoundingClientRect(); return box.left >= 0 && box.right <= window.innerWidth;
    }));
    await expect.poll(toolbarFits).toBe(true);
    await expect(page.getByRole('button', { name: '展开目录面板', exact: true })).toBeVisible();
    expect(await page.locator('.brand').evaluate((element) => [...element.children].map((child) => child.classList[0]))).toEqual(['profile-trigger', 'icon-button', 'wordmark']);
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
    await expect.poll(() => application.evaluate(() => global.blankMenu?.items.filter((item) => item.type !== 'separator').map((item) => item.label))).toEqual(['复制工作区路径', '重新载入工作树']);
    await fs.writeFile(path.join(sourceDirectory, '新文件.md'), '# 新文件');
    await application.evaluate(() => global.blankMenu.items.find((item) => item.label === '重新载入工作树').click());
    await expect(page.getByRole('treeitem', { name: 'MD 新文件.md' })).toBeVisible();
    const moved = `${sourceDirectory}-暂存`;
    await fs.rename(sourceDirectory, moved);
    await application.evaluate(() => global.blankMenu.items.find((item) => item.label === '重新载入工作树').click());
    await expect(page.locator('.workspace-sidebar').getByRole('alert')).toContainText('ENOENT');
    await page.locator('.workspace-sidebar .sidebar-scroll').click({ button: 'right', position: { x: 50, y: 250 } });
    await expect.poll(() => application.evaluate(() => global.blankMenuCount)).toBe(2);
    await fs.rename(moved, sourceDirectory);
    await application.evaluate(() => global.blankMenu.items.find((item) => item.label === '重新载入工作树').click());
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
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(310);
    await expect.poll(toolbarFits).toBe(true);
    const reading = await page.locator('.reading-area').boundingBox();
    const entry = page.getByRole('button', { name: '展开目录面板', exact: true });
    const entryBox = await entry.boundingBox();
    expect(entryBox.x).toBeGreaterThanOrEqual(reading.x + reading.width);
    async function capture(name) {
      const image = await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      await fs.writeFile(test.info().outputPath(name), Buffer.from(image, 'base64'));
    }
    await capture('narrow-toc-entry.png');
    await entry.click();
    await expect(page.locator('.outline.panel-overlay')).toBeVisible();
    expect(await page.locator('.reading-area').boundingBox()).toEqual(reading);
    const collapse = await page.getByRole('button', { name: '折叠目录面板', exact: true }).boundingBox();
    const outline = await page.locator('.outline').boundingBox();
    const outlineContent = await page.locator('.outline-content').boundingBox();
    expect(outlineContent.x - outline.x).toBeLessThanOrEqual(1);
    expect(outline.width - outlineContent.width).toBeLessThanOrEqual(1);
    expect(collapse.x).toBeGreaterThanOrEqual(0);
    expect(Math.abs(collapse.x + collapse.width - outline.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(collapse.y + collapse.height / 2 - outline.y - outline.height / 2)).toBeLessThanOrEqual(1);
    await capture('narrow-toc-overlay.png');
    await page.getByRole('button', { name: '折叠目录面板', exact: true }).click();
    await expect(page.locator('.outline.panel-overlay')).toHaveCount(0);
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
    await chooseEditor(application, executable);
    await dialog.getByRole('button', { name: '选择应用…' }).first().click();
    await expect(dialog.locator('.editor-setting').first()).toContainText(executable);
    await chooseEditor(application, null);
    await dialog.getByRole('button', { name: '选择应用…' }).last().click();
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
