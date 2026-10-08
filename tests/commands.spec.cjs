const { test, expect } = require('@playwright/test');
const { launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const platformArgs = process.platform === 'linux' ? [process.env.EMD_NATIVE_KDE === '1' ? '--ozone-platform=wayland' : '--ozone-platform=x11'] : [];

test('工作树文件/目录与后台标签复制绝对和相对路径，空白处复制工作区路径', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-copy-path-')));
  let application, originalClipboard;
  try {
    const entry = path.join(directory, '入口.md'), folder = path.join(directory, '章节'), nested = path.join(folder, '页面.html');
    await fs.mkdir(folder);
    await fs.writeFile(entry, '# 入口'); await fs.writeFile(nested, '<h1>页面</h1>');
    const packaged = process.env.EMD_PACKAGED === '1';
    application = await launch({ executablePath: packaged ? path.resolve('release/linux-unpacked/emd') : undefined,
      args: [...(packaged ? [] : [path.resolve('.')]), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`, entry, nested] });
    const page = await application.firstWindow();
    await expect(page.getByRole('tab')).toHaveCount(2);
    await page.getByRole('tab', { name: 'MD 入口.md', exact: true }).click();
    const activeId = await page.getByRole('tab', { selected: true }).getAttribute('id');
    if (await page.getByRole('button', { name: '显示工作区', exact: true }).getAttribute('aria-pressed') === 'false') await page.getByRole('button', { name: '显示工作区', exact: true }).click();
    await expect(page.locator('.workspace-root')).toHaveAttribute('title', directory);
    await page.getByRole('button', { name: '显示目录', exact: true }).click();
    await application.evaluate(({ Menu }) => {
      const build = Menu.buildFromTemplate;
      Menu.buildFromTemplate = (template) => { const menu = build(template); menu.popup = () => { global.pathMenu = menu; }; return menu; };
    });
    originalClipboard = await application.evaluate(({ clipboard }) => clipboard.readText());
    async function context(locator, options = {}) {
      await application.evaluate(() => { global.pathMenu = null; });
      await locator.click({ button: 'right', ...options });
      await expect.poll(() => application.evaluate(() => !!global.pathMenu)).toBe(true);
    }
    async function copy(label, wanted) {
      await application.evaluate((_, label) => global.pathMenu.items.find((item) => item.label === label).click(), label);
      await expect.poll(() => application.evaluate(({ clipboard }) => clipboard.readText())).toBe(wanted);
    }
    const directoryNode = page.getByRole('treeitem', { name: '章节', exact: true });
    await context(directoryNode);
    await copy('复制路径', folder); await copy('复制相对路径', '章节');
    if (await directoryNode.getAttribute('aria-expanded') === 'false') await directoryNode.click();
    await context(page.getByRole('treeitem', { name: 'HTML 页面.html', exact: true }));
    await copy('复制路径', nested); await copy('复制相对路径', path.join('章节', '页面.html'));
    await context(page.getByRole('tab', { name: 'HTML 页面.html', exact: true }));
    await copy('复制路径', nested); await copy('复制相对路径', path.join('章节', '页面.html'));
    await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('id', activeId);
    await context(page.locator('.workspace-root')); await copy('复制相对路径', '.');
    await context(page.locator('.workspace-sidebar .sidebar-scroll'), { position: { x: 50, y: 300 } });
    await copy('复制工作区路径', directory);
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    try {
      if (application) {
        try { if (originalClipboard !== undefined) await application.evaluate(({ clipboard }, text) => clipboard.writeText(text), originalClipboard); }
        finally { await close(application); }
      }
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  }
});

test('F12 与文件菜单打开独立控制台，复用、关闭重开且不改变阅读尺寸', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-devtools-'));
  let application;
  try {
    const packaged = process.env.EMD_PACKAGED === '1';
    application = await launch({ executablePath: packaged ? path.resolve('release/linux-unpacked/emd') : undefined, args: [...(packaged ? [] : [path.resolve('.')]), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`] });
    const page = await application.firstWindow();
    await expect(page.getByRole('button', { name: '打开 Markdown / HTML' })).toBeVisible();
    const before = await page.locator('.reading-area').boundingBox();
    const opened = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(item => !item.isDestroyed() && !item.webContents.isDestroyed() && item.webContents.getURL().startsWith('devtools://') && item.isVisible()));
    await application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.sendInputEvent({ type: 'keyDown', keyCode: 'F12' });
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'F12' });
    });
    await expect.poll(opened).toBe(true);
    const id = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && !item.webContents.isDestroyed() && item.webContents.getURL().startsWith('devtools://')).webContents.id);
    await page.getByRole('button', { name: '文件', exact: true }).click();
    await page.getByRole('menuitem', { name: '开发者控制台' }).click();
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && !item.webContents.isDestroyed() && item.webContents.getURL().startsWith('devtools://')).webContents.id)).toBe(id);
    expect(await page.locator('.reading-area').boundingBox()).toEqual(before);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && !item.webContents.isDestroyed() && item.webContents.getURL().startsWith('devtools://')).close());
    await expect.poll(opened).toBe(false);
    await page.evaluate(() => window.emd.command('openDeveloperTools'));
    await expect.poll(opened).toBe(true);
    for (let index = 0; index < 5; index++) {
      await application.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && !item.webContents.isDestroyed() && item.webContents.getURL().startsWith('devtools://')).minimize();
      });
      await page.getByRole('button', { name: '文件', exact: true }).click();
      await page.getByRole('menuitem', { name: '开发者控制台' }).click();
      await expect.poll(() => application.evaluate(({ BrowserWindow }) => {
        const tools = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && !item.webContents.isDestroyed() && item.webContents.getURL().startsWith('devtools://'));
        return tools.isVisible() && !tools.isMinimized();
      })).toBe(true);
      await application.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && !item.webContents.isDestroyed() && item.webContents.getURL().startsWith('devtools://')).close();
      });
      await expect.poll(opened).toBe(false);
      await application.evaluate(({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows().find(item => item.webContents.getURL() === 'emd://app/index.html').webContents;
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'F12' }); contents.sendInputEvent({ type: 'keyUp', keyCode: 'F12' });
      });
      await expect.poll(opened).toBe(true);
      expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
      expect(await page.locator('.reading-area').boundingBox()).toEqual(before);
    }
    await application.context().tracing.stop({ path: test.info().outputPath('electron-context-trace.zip') });
    const readerClosed = application.waitForEvent('close');
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(item => item.webContents.getURL() === 'emd://app/index.html').close());
    await readerClosed; application = null;
  } finally {
    if (application) await close(application);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('真实键盘、按钮和原生菜单共用命令，查找输入保留复制粘贴', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-commands-')));
  let application, clipboard;
  const errors = [];
  try {
    const files = ['一.md', '二.md', '三.md'].map((name) => path.join(directory, name));
    await Promise.all(files.map((file, index) => fs.writeFile(file, `# 文档${index + 1}\n\n查找文本。\n`)));
    application = await launch({ args: [path.resolve('.'), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`, ...files] });
    const page = await application.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('tab')).toHaveCount(3);
    const primary = process.platform === 'darwin' ? 'meta' : 'control';
    const hint = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
    async function key(keyCode, modifiers = []) {
      await application.evaluate(({ BrowserWindow }, { keyCode, modifiers }) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
        contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
      }, { keyCode, modifiers });
    }
    await expect(page.getByRole('button', { name: '打开文件', exact: true })).toHaveAttribute('title', `打开文件 · ${hint}+O`);
    await application.evaluate(({ dialog }) => {
      global.openCount = 0;
      dialog.showOpenDialog = async () => { global.openCount++; return { canceled: true, filePaths: [] }; };
    });
    await application.evaluate(({ BrowserWindow }) => {
      global.commandInputs = [];
      BrowserWindow.getAllWindows()[0].webContents.on('before-input-event', (_event, input) => {
        if (input.type === 'keyDown') global.commandInputs.push({ ...input, prevented: _event.defaultPrevented });
      });
    });
    await key('O', [primary, 'shift']);
    await key('O', [primary, 'alt']);
    expect(await application.evaluate(() => global.openCount)).toBe(0);
    await key('O', [primary]);
    await expect.poll(() => application.evaluate(() => global.openCount)).toBe(1);
    await page.getByRole('button', { name: '打开文件', exact: true }).click();
    await expect.poll(() => application.evaluate(() => global.openCount)).toBe(2);
    if (process.platform === 'darwin') {
      expect(await application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('openDocument').accelerator)).toBe('Command+O');
      await application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('openDocument').click());
      await expect.poll(() => application.evaluate(() => global.openCount)).toBe(3);
      await key('O', [primary]);
      await expect.poll(() => application.evaluate(() => global.openCount)).toBe(4);
    }
    await key('Tab', ['control']);
    await expect(page.getByRole('tab', { selected: true })).toContainText('一.md');
    await key('Tab', ['control', 'shift']);
    await expect(page.getByRole('tab', { selected: true })).toContainText('三.md');
    await key('F', [primary]);
    const search = page.getByRole('textbox', { name: '查找内容' });
    await expect(search).toBeFocused();
    await page.getByRole('button', { name: '打开文件', exact: true }).focus();
    await key('F', [primary]);
    await expect(search).toBeFocused();
    await application.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0].focus();
    });
    await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused())).toBe(true);
    await search.focus();
    clipboard = await application.evaluate(({ clipboard }) => clipboard.readText());
    await application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      const findInPage = contents.findInPage.bind(contents);
      global.findQueries = new Map();
      global.completedFindQuery = null;
      contents.findInPage = (query, options) => {
        const requestId = findInPage(query, options);
        global.findQueries.set(requestId, query);
        return requestId;
      };
      contents.on('found-in-page', (_event, result) => {
        if (result.finalUpdate) global.completedFindQuery = global.findQueries.get(result.requestId);
      });
    });
    async function focusAfterSearch(query) {
      await application.evaluate(() => { global.completedFindQuery = null; });
      await search.fill(query);
      await expect.poll(() => application.evaluate(() => global.completedFindQuery)).toBe(query);
      await application.evaluate(({ app, BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        app.focus({ steal: true });
        window.focus();
        window.webContents.focus();
      });
      if (process.platform === 'darwin') await expect.poll(() => application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return window.isFocused() && window.webContents.isFocused();
      })).toBe(true);
      // Click establishes the native editable responder as well as DOM focus.
      await search.click();
      await expect(search).toBeFocused();
    }
    if (process.platform === 'darwin') {
      // Verify key forwarding separately from Cocoa editing. Use fixture text
      // so a synthetic paste cannot insert the user's original clipboard.
      await application.evaluate(({ clipboard }) => clipboard.writeText('路由探针'));
      for (const keyCode of ['A', 'C', 'V']) {
        await key(keyCode, [primary]);
        const input = await application.evaluate(() => global.commandInputs.at(-1));
        expect(input.key.toLowerCase()).toBe(keyCode.toLowerCase());
        expect(input.prevented).toBe(false);
      }
    }
    async function edit(keyCode, action) {
      if (process.platform === 'darwin') {
        await expect(search).toBeFocused();
        await application.evaluate(({ Menu }, action) => Menu.sendActionToFirstResponder(action), action);
      } else await key(keyCode, [primary]);
    }
    // The debounced find can move DOM focus while window focus and input
    // selection offsets remain unchanged. Complete it before native editing.
    await focusAfterSearch('原生复制');
    await application.evaluate(({ clipboard }) => clipboard.writeText('等待复制'));
    await edit('A', 'selectAll:');
    await expect.poll(() => search.evaluate((input) => input.selectionEnd - input.selectionStart)).toBe(4);
    await edit('C', 'copy:');
    await expect.poll(() => application.evaluate(({ clipboard }) => clipboard.readText())).toBe('原生复制');
    // Replace different text so this assertion proves paste actually happened.
    await focusAfterSearch('等待粘贴');
    await edit('A', 'selectAll:');
    await expect.poll(() => search.evaluate((input) => input.selectionEnd - input.selectionStart)).toBe(4);
    await edit('V', 'paste:');
    await expect(search).toHaveValue('原生复制');
    await page.getByRole('button', { name: '关闭查找' }).click();
    const zoom = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel());
    await key('+', [primary, 'shift']);
    await expect.poll(zoom).toBe(0.5);
    await key('numadd', [primary]);
    const keypad = await application.evaluate(() => global.commandInputs.at(-1));
    expect([keypad.key, keypad.code]).toEqual(['+', 'NumpadAdd']);
    await expect.poll(zoom).toBe(1);
    await key('0', [primary]);
    await expect.poll(zoom).toBe(0);
    await key('-', [primary, 'shift']);
    expect(await zoom()).toBe(0);
    await key('numsub', [primary]);
    await expect.poll(zoom).toBe(-0.5);
    await key('0', [primary]);
    await expect.poll(zoom).toBe(0);
    await key('F', ['alt']);
    await expect(page.getByRole('menuitem', { name: '另存为…' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '另存为…' }).locator('kbd')).toHaveText(`${hint}+Shift+S`);
    await page.getByRole('menuitem', { name: '关闭标签页' }).click();
    await expect(page.getByRole('tab')).toHaveCount(2);
    await key('W', [primary, 'shift']);
    expect(await page.getByRole('tab').count()).toBe(2);
    await key('W', [primary]);
    await expect(page.getByRole('tab')).toHaveCount(1);
    await page.getByRole('tab').click({ button: 'middle' });
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '打开 Markdown / HTML' }).locator('span')).toHaveText(`${hint}+O`);
    if (process.platform === 'darwin') await expect.poll(() => application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('saveAs').enabled)).toBe(false);
    await key('F', [primary]);
    await expect(search).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    try {
      if (application) {
        try {
          if (clipboard !== undefined) await application.evaluate(({ clipboard }, original) => clipboard.writeText(original), clipboard);
        } finally { await close(application); }
      }
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  }
});

test('全屏使用本平台绑定，工作区祖先由主进程返回', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-command-path-')));
  let application;
  try {
    const entry = path.join(directory, '入口.md');
    const nested = path.join(directory, '章节', '正文.md');
    await fs.mkdir(path.dirname(nested));
    await fs.writeFile(entry, '# 入口\n');
    await fs.writeFile(nested, '# 正文\n');
    application = await launch({ args: [path.resolve('.'), ...platformArgs, `--user-data-dir=${path.join(directory, 'profile')}`, entry, nested] });
    const page = await application.firstWindow();
    await expect(page.getByRole('tab')).toHaveCount(2);
    if (await page.getByRole('button', { name: '显示工作区', exact: true }).getAttribute('aria-pressed') === 'false') await page.getByRole('button', { name: '显示工作区', exact: true }).click();
    await page.getByRole('tab').first().click();
    await expect(page.locator('.workspace-root')).toHaveAttribute('title', directory);
    await page.getByRole('tab').last().click();
    await expect(page.locator('.workspace-root')).toHaveAttribute('title', directory);
    await expect(page.getByRole('treeitem', { name: '章节', exact: true })).toHaveAttribute('aria-expanded', 'true');
    const context = await page.evaluate(async () => {
      const id = document.querySelector('[role=tab][aria-selected=true]').id.slice(4);
      return window.emd.workspace(id, document.querySelector('.workspace-root').title);
    });
    expect(context.activeAncestors).toEqual([path.dirname(nested), directory]);
    const { originalBounds, displayBounds } = await application.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return { originalBounds: window.getBounds(), displayBounds: screen.getDisplayMatching(window.getBounds()).bounds };
    });
    await application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      const keyCode = process.platform === 'darwin' ? 'F' : 'F11';
      const modifiers = process.platform === 'darwin' ? ['control', 'meta'] : [];
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    });
    if (process.platform === 'win32') {
      await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(displayBounds);
    } else await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
    await page.evaluate(() => window.emd.command('toggleFullscreen'));
    if (process.platform === 'win32') await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(originalBounds);
    else await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
  } finally {
    if (application) await close(application);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
