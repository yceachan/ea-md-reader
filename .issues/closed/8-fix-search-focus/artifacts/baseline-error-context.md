# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: commands.spec.cjs >> 自动查找完成后保持输入焦点，允许继续输入
- Location: tests/commands.spec.cjs:8:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('textbox', { name: '查找内容' })
Expected: focused
Received: inactive
Timeout:  5000ms

Call log:
  - Expect "toBeFocused" getByRole('textbox', { name: '查找内容' }) with timeout 5000ms
  - waiting for getByRole('textbox', { name: '查找内容' })
    14 × locator resolved to <input value="a" aria-label="查找内容" placeholder="在文档中查找…"/>
       - unexpected value "inactive"

```

```yaml
- textbox "查找内容":
  - /placeholder: 在文档中查找…
  - text: a
```

# Test source

```ts
  1   | const { expect } = require('@playwright/test');
  2   | const { test, launch, close, stopTracing } = require('./electron-fixture.cjs');
  3   | const fs = require('node:fs/promises');
  4   | const os = require('node:os');
  5   | const path = require('node:path');
  6   | const platformArgs = process.platform === 'linux' ? [process.env.EMD_NATIVE_KDE === '1' ? '--ozone-platform=wayland' : '--ozone-platform=x11'] : [];
  7   | 
  8   | test('自动查找完成后保持输入焦点，允许继续输入', async () => {
  9   |   const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-find-focus-'));
  10  |   let application;
  11  |   try {
  12  |     const fixture = path.join(directory, '查找.md');
  13  |     await fs.writeFile(fixture, '# 连续输入\n\nalpha alphabet alpha\n');
  14  |     application = await launch({ args: [path.resolve('.'), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`, fixture] });
  15  |     const page = await application.firstWindow();
  16  |     await expect(page.locator('.vp-doc h1')).toHaveText('连续输入');
  17  |     await application.evaluate(({ BrowserWindow }) => {
  18  |       global.findResults = [];
  19  |       BrowserWindow.getAllWindows()[0].webContents.on('found-in-page', (_event, result) => {
  20  |         if (result.finalUpdate) global.findResults.push(result);
  21  |       });
  22  |     });
  23  |     await page.getByRole('button', { name: '查找', exact: true }).click();
  24  |     const search = page.getByRole('textbox', { name: '查找内容' });
  25  |     await expect(search).toBeFocused();
  26  |     await page.keyboard.type('a');
  27  |     await expect.poll(() => application.evaluate(() => global.findResults.length)).toBe(1);
> 28  |     await expect(search).toBeFocused();
      |                          ^ Error: expect(locator).toBeFocused() failed
  29  |     await page.keyboard.type('lpha');
  30  |     await expect(search).toHaveValue('alpha');
  31  |     await expect.poll(() => application.evaluate(() => global.findResults.length)).toBe(2);
  32  |     await expect(search).toBeFocused();
  33  |   } finally {
  34  |     if (application) await close(application);
  35  |     await fs.rm(directory, { recursive: true, force: true });
  36  |   }
  37  | });
  38  | 
  39  | test('工作树文件/目录与后台标签复制绝对和相对路径，空白处复制工作区路径', async () => {
  40  |   const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-copy-path-')));
  41  |   let application, originalClipboard;
  42  |   try {
  43  |     const entry = path.join(directory, '入口.md'), folder = path.join(directory, '章节'), nested = path.join(folder, '页面.html');
  44  |     await fs.mkdir(folder);
  45  |     await fs.writeFile(entry, '# 入口'); await fs.writeFile(nested, '<h1>页面</h1>');
  46  |     const packaged = process.env.EMD_PACKAGED === '1';
  47  |     application = await launch({ executablePath: packaged ? path.resolve('release/linux-unpacked/emd') : undefined,
  48  |       args: [...(packaged ? [] : [path.resolve('.')]), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`, entry, nested] });
  49  |     const page = await application.firstWindow();
  50  |     await expect(page.getByRole('tab')).toHaveCount(2);
  51  |     await page.getByRole('tab', { name: 'MD 入口.md', exact: true }).click();
  52  |     const activeId = await page.getByRole('tab', { selected: true }).getAttribute('id');
  53  |     if (await page.getByRole('button', { name: '显示工作区', exact: true }).getAttribute('aria-pressed') === 'false') await page.getByRole('button', { name: '显示工作区', exact: true }).click();
  54  |     await expect(page.locator('.workspace-root')).toHaveAttribute('title', directory);
  55  |     await page.getByRole('button', { name: '显示目录', exact: true }).click();
  56  |     await application.evaluate(({ Menu }) => {
  57  |       const build = Menu.buildFromTemplate;
  58  |       Menu.buildFromTemplate = (template) => { const menu = build(template); menu.popup = () => { global.pathMenu = menu; }; return menu; };
  59  |     });
  60  |     originalClipboard = await application.evaluate(({ clipboard }) => clipboard.readText());
  61  |     async function context(locator, options = {}) {
  62  |       await application.evaluate(() => { global.pathMenu = null; });
  63  |       await locator.click({ button: 'right', ...options });
  64  |       await expect.poll(() => application.evaluate(() => !!global.pathMenu)).toBe(true);
  65  |     }
  66  |     async function copy(label, wanted) {
  67  |       await application.evaluate((_, label) => global.pathMenu.items.find((item) => item.label === label).click(), label);
  68  |       await expect.poll(() => application.evaluate(({ clipboard }) => clipboard.readText())).toBe(wanted);
  69  |     }
  70  |     const directoryNode = page.getByRole('treeitem', { name: '章节', exact: true });
  71  |     await context(directoryNode);
  72  |     await copy('复制路径', folder); await copy('复制相对路径', '章节');
  73  |     if (await directoryNode.getAttribute('aria-expanded') === 'false') await directoryNode.click();
  74  |     await context(page.getByRole('treeitem', { name: 'HTML 页面.html', exact: true }));
  75  |     await copy('复制路径', nested); await copy('复制相对路径', path.join('章节', '页面.html'));
  76  |     await context(page.getByRole('tab', { name: 'HTML 页面.html', exact: true }));
  77  |     await copy('复制路径', nested); await copy('复制相对路径', path.join('章节', '页面.html'));
  78  |     await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('id', activeId);
  79  |     await context(page.locator('.workspace-root')); await copy('复制相对路径', '.');
  80  |     await context(page.locator('.workspace-sidebar .sidebar-scroll'), { position: { x: 50, y: 300 } });
  81  |     await copy('复制工作区路径', directory);
  82  |     await expect(page.getByRole('alert')).toHaveCount(0);
  83  |   } finally {
  84  |     try {
  85  |       if (application) {
  86  |         try { if (originalClipboard !== undefined) await application.evaluate(({ clipboard }, text) => clipboard.writeText(text), originalClipboard); }
  87  |         finally { await close(application); }
  88  |       }
  89  |     } finally { await fs.rm(directory, { recursive: true, force: true }); }
  90  |   }
  91  | });
  92  | 
  93  | test('Reader 的元素选择快捷键在首次打开和连续选择后均可重新启用', async () => {
  94  |   const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-inspect-'));
  95  |   let application;
  96  |   try {
  97  |     application = await launch({ args: [path.resolve('.'), ...platformArgs, `--user-data-dir=${directory}`] });
  98  |     const page = await application.firstWindow();
  99  |     await page.getByRole('button', { name: '个人资料', exact: true }).click();
  100 |     await expect(page.locator('.profile-card h2')).toHaveText('yceachan');
  101 |     const primary = process.platform === 'darwin' ? 'meta' : 'control';
  102 |     async function inspect() {
  103 |       await application.evaluate(({ BrowserWindow }, primary) => {
  104 |         const reader = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'emd://app/index.html');
  105 |         reader.focus();
  106 |         reader.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'C', modifiers: [primary, 'shift'] });
  107 |         reader.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'C', modifiers: [primary, 'shift'] });
  108 |       }, primary);
  109 |     }
  110 |     const toolsOpened = application.waitForEvent('window');
  111 |     await inspect();
  112 |     const frontend = await toolsOpened;
  113 |     const selector = frontend.getByRole('button', { name: /Select an element in the page to inspect it/ });
  114 |     for (let index = 0; index < 3; index++) {
  115 |       if (index) await inspect();
  116 |       await expect(selector).toHaveAttribute('aria-pressed', 'true');
  117 |       const targetSelector = index % 2 ? '.profile-tagline' : '.profile-card h2';
  118 |       const target = await page.locator(targetSelector).boundingBox();
  119 |       await application.evaluate(({ BrowserWindow }) => {
  120 |         BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'emd://app/index.html').focus();
  121 |       });
  122 |       await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  123 |       await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  124 |       await expect(selector).toHaveAttribute('aria-pressed', 'false');
  125 |       await expect(frontend.locator('.elements-tree-outline .selected').first()).toContainText(index % 2 ? "As Eachan's Views" : 'yceachan');
  126 |     }
  127 |     await frontend.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+C' : 'Control+Shift+C');
  128 |     await expect(selector).toHaveAttribute('aria-pressed', 'true');
```