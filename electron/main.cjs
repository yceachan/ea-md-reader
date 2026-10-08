const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, shell, nativeTheme, nativeImage, screen, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fileArguments, documentKind, readDocument, publicDocument, saveDocument, scanWorkspace, isWithin, workspaceContext, IMAGE_TYPES } = require('./files.cjs');

const { selectPlatform } = require('./platforms/index.cjs');
const { createCommandSet, consumeInput } = require('./commands.cjs');
const { settingsStore, editorKind } = require('./settings.cjs');
const { editorSessions } = require('./editor-sessions.cjs');
const { developerTools } = require('./devtools.cjs');
const platform = selectPlatform();
const commandSet = createCommandSet(platform.keyboard);
const devUrl = !app.isPackaged ? process.env.EMD_DEV_URL : undefined;
const appUrl = devUrl ?? 'emd://app/index.html';
if (devUrl) {
  const url = new URL(devUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/index.html' || url.search || url.hash || url.username || url.password) {
    throw new Error('开发页面必须是本次 Vite 服务的 127.0.0.1 HTTP 地址。');
  }
}

app.setName('emd');
nativeTheme.themeSource = 'light';
protocol.registerSchemesAsPrivileged([
  { scheme: 'emd', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'emd-asset', privileges: { standard: true, secure: true } },
  { scheme: 'emd-page', privileges: { standard: true, secure: true } },
]);
let window;
let toggleFullscreen;
let openDeveloperTools;
let rendererReady = false;
let activeDocumentId = null;
let applicationMenu = null;
let startupDisplayWidth = null;
const documents = new Map();
const workspaceRoots = new Set();
const pending = [];
const isPrimary = app.requestSingleInstanceLock();

function send(channel, payload) {
  if (rendererReady) window.webContents.send(channel, payload);
  else pending.push([channel, payload]);
}
function showError(error) {
  send('emd:error', error.message);
}
async function openPaths(paths) {
  for (const filePath of paths) {
    try {
      const document = await readDocument(filePath);
      const existing = [...documents.values()].find((item) => item.path === document.path);
      if (existing) send('emd:activate', existing.id);
      else {
        documents.set(document.id, document);
        send('emd:document', publicDocument(document));
      }
    } catch (error) {
      showError(new Error(`${filePath}\n${error.message}`));
    }
  }
}
async function openDialog() {
  const result = await dialog.showOpenDialog(window, {
    title: '打开 Markdown 或 HTML', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown / HTML', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx', 'html', 'htm'] }],
  });
  if (!result.canceled) await openPaths(result.filePaths);
}
function getDocument(id) {
  if (typeof id !== 'string' || !documents.has(id)) throw new Error('文件已关闭。');
  return documents.get(id);
}
function checkedHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== appUrl) throw new Error('无效的应用请求。');
    try { return await handler(...args); }
    catch (error) { showError(error); return null; }
  });
}
function commandEnabled(id, documentId = activeDocumentId) {
  return !commandSet.get(id).requiresDocument || documents.has(documentId);
}
function updateCommandMenu() {
  if (!applicationMenu) return;
  for (const command of commandSet.items) {
    const item = applicationMenu.getMenuItemById(command.id);
    if (item) item.enabled = commandEnabled(command.id);
  }
}
async function dispatchCommand(id, documentId = activeDocumentId) {
  const command = commandSet.get(id);
  if (documentId !== null && documentId !== undefined) getDocument(documentId);
  if (!commandEnabled(id, documentId)) return false;
  if (id === 'openDocument') await openDialog();
  else if (id === 'quit') app.quit();
  else if (id === 'toggleFullscreen') toggleFullscreen();
  else if (id === 'openDeveloperTools') openDeveloperTools();
  else if (id === 'zoomIn') window.webContents.setZoomLevel(window.webContents.getZoomLevel() + 0.5);
  else if (id === 'zoomOut') window.webContents.setZoomLevel(window.webContents.getZoomLevel() - 0.5);
  else if (id === 'zoomReset') window.webContents.setZoomLevel(0);
  else send('emd:action', { id: command.id, documentId });
  if (['zoomIn', 'zoomOut', 'zoomReset'].includes(id)) sendDisplayWidth();
  return true;
}
function commandItem(id) {
  const { label, accelerator } = commandSet.get(id);
  return { id, label, accelerator, enabled: commandEnabled(id), click: () => { dispatchCommand(id).catch(showError); } };
}
function focusWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function sendDisplayWidth() {
  send('emd:display-width', (startupDisplayWidth ?? screen.getDisplayMatching(window.getBounds()).workAreaSize.width) / window.webContents.getZoomFactor());
}
async function chooseEditor(kind) {
  if (platform.chooseEditor) return platform.chooseEditor(kind, window);
  const result = await dialog.showOpenDialog(window, { title: '选择编辑器', properties: ['openFile'] });
  return result.canceled ? null : platform.validateEditor(result.filePaths[0]);
}

if (!isPrimary) app.quit();
else {
  app.on('second-instance', (_event, argv, cwd) => {
    openPaths(fileArguments(argv, cwd));
    focusWindow();
  });
  platform.install(app, { openFiles: openPaths, focusWindow });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    protocol.handle('emd', (request) => {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);
      const file = path.resolve(__dirname, '..', 'dist', `.${pathname}`);
      const root = path.resolve(__dirname, '..', 'dist');
      if (url.host !== 'app' || !file.startsWith(`${root}${path.sep}`)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).href);
    });
    protocol.handle('emd-asset', async (request) => {
      try {
        const url = new URL(request.url);
        const document = getDocument(url.host);
        const assetPath = path.resolve(path.dirname(document.path), decodeURIComponent(url.pathname.slice(1)));
        const mime = IMAGE_TYPES[path.extname(assetPath).toLowerCase()];
        if (!mime) return new Response('Unsupported image type', { status: 415 });
        return new Response(await fs.readFile(assetPath), { headers: { 'Content-Type': mime, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } });
      } catch (error) {
        console.error('Cannot read image:', error.message);
        return new Response('Image unavailable', { status: 404 });
      }
    });
    protocol.handle('emd-page', (request) => {
      try {
        const url = new URL(request.url);
        const document = getDocument(url.host);
        if (document.kind !== 'html' || url.pathname !== '/index.html') return new Response('Page unavailable', { status: 404 });
        // Serve the opened snapshot on a separate origin. Inline scripts have no app or filesystem access.
        return new Response(document.bytes, { headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts",
        } });
      } catch (error) {
        console.error('Cannot read HTML page:', error.message);
        return new Response('HTML 页面无法读取，请重新打开文件。', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    });
    const settings = settingsStore(path.join(app.getPath('userData'), 'setting.toml'));
    const startupSupported = platform.startupLayout?.supported() === true;
    const publicSettings = async () => ({ ...await settings.get(), startupSupported });
    const layout = (await settings.get()).startup.layout;
    let startup = { root: null, workspace: false, panels: { left: layout === 'default', right: layout === 'default' } };
    let placement = null, startupError = null;
    if (startupSupported) {
      try {
        startup = await platform.startupLayout.context(layout, process.cwd());
        placement = await platform.startupLayout.prepare({ layout, ...startup, screen });
      }
      catch (error) { startupError = error; }
    } else if (layout !== 'default') startupError = new Error('当前平台尚未实现专注启动布局。');
    const initialRoot = startup.workspace ? startup.root : null;
    console.info('[emd] 启动布局', JSON.stringify({ layout, cwd: process.cwd(), count: startup.count, panels: startup.panels, geometry: placement?.geometry }));
    startupDisplayWidth = placement?.displayWidth ?? null;
    if (initialRoot) workspaceRoots.add(initialRoot);
    window = new BrowserWindow({
      width: 1180, height: 850, ...placement?.geometry, minWidth: 620, minHeight: 440, show: false, frame: false, transparent: true,
      title: 'Ea.Md.Reader', backgroundColor: '#00000000', icon: nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'emd.png')).resize({ width: 128, height: 128 }),
      ...platform.windowOptions,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    toggleFullscreen = platform.createFullscreenToggle(window);
    openDeveloperTools = developerTools(window);
    if (placement?.dispose) window.once('closed', placement.dispose);
    if (placement?.applied) placement.applied.then((result) => console.info('[emd] KWin 启动布局已确认', JSON.stringify(result.geometry))).catch((error) => { console.error('[emd] 启动布局失败', error); if (!window.isDestroyed()) showError(new Error(`启动布局失败：${error.message}`)); });
    if (startupError) { console.error('[emd] 启动布局失败', startupError); showError(new Error(`启动布局失败：${startupError.message}`)); }
    const sessions = editorSessions({ documents, changed: (document) => send('emd:document-update', publicDocument(document)), onError: showError });
    async function editFile(filePath, choose) {
      if (typeof choose !== 'boolean') throw new Error('无效的编辑器请求。');
      if (!(await fs.stat(filePath)).isFile()) throw new Error('请选择要编辑的文件。');
      const kind = documentKind(filePath);
      let editor;
      if (choose) {
        const program = await chooseEditor(kind);
        if (program === null) return false;
        editor = { program };
      } else {
        editor = (await settings.get()).editors[kind];
        if (!editor) { await dispatchCommand('openSettings'); throw new Error(`请先配置 ${kind === 'markdown' ? 'Markdown' : 'HTML'} 编辑器。`); }
      }
      return sessions.open(filePath, () => platform.startEditor(editor, filePath));
    }
    function editorMenu(filePath) {
      return [
        { label: '在配置编辑器中打开', click: () => { editFile(filePath, false).catch(showError); } },
        { label: '打开方式…', click: () => { editFile(filePath, true).catch(showError); } },
      ];
    }
    function pathMenu(filePath, root) {
      return [
        { label: '复制路径', click: () => clipboard.writeText(filePath) },
        { label: '复制相对路径', click: () => clipboard.writeText(path.relative(root, filePath) || '.') },
      ];
    }
    window.on('focus', () => { void sessions.refresh(); });
    window.on('closed', () => sessions.dispose());
    window.webContents.on('will-navigate', (event, url) => { if (!devUrl || url !== appUrl) event.preventDefault(); });
    window.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) rendererReady = false;
    });
    window.webContents.on('will-frame-navigate', (event) => {
      // Only the app can load an opened HTML snapshot. Block other frame destinations.
      const url = new URL(event.url);
      if (devUrl && event.isMainFrame && event.url === appUrl) return;
      if (event.initiator?.url !== appUrl || url.protocol !== 'emd-page:' ||
          url.pathname !== '/index.html' || documents.get(url.host)?.kind !== 'html') event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    applicationMenu = platform.createMenu({ Menu, commandItem });
    Menu.setApplicationMenu(applicationMenu);
    window.webContents.on('before-input-event', (event, input) => {
      consumeInput(event, input, commandSet, (id) => { dispatchCommand(id).catch(showError); });
    });
    window.on('maximize', () => send('emd:window-state', true));
    window.on('unmaximize', () => send('emd:window-state', false));
    window.on('resize', () => { send('emd:window-state', window.isMaximized()); sendDisplayWidth(); });
    window.on('move', sendDisplayWidth);
    screen.on('display-metrics-changed', sendDisplayWidth);
    window.on('closed', () => screen.removeListener('display-metrics-changed', sendDisplayWidth));
    checkedHandler('emd:window', (action) => {
      if (action === 'minimize') window.minimize();
      else if (action === 'maximize') { if (window.isMaximized()) window.unmaximize(); else window.maximize(); }
      else if (action === 'close') window.close();
      else throw new Error('无效的窗口操作。');
    });
    checkedHandler('emd:ready', () => {
      rendererReady = true;
      send('emd:window-state', window.isMaximized());
      sendDisplayWidth();
      for (const [channel, payload] of pending.splice(0)) window.webContents.send(channel, payload);
      // The new renderer may have missed events sent while its predecessor unloaded.
      for (const document of documents.values()) send('emd:document', publicDocument(document));
      if (activeDocumentId) send('emd:activate', activeDocumentId);
      return commandSet.hints;
    });
    checkedHandler('emd:command', dispatchCommand);
    checkedHandler('emd:settings', publicSettings);
    checkedHandler('emd:startup-state', () => ({ workspace: !!initialRoot, root: initialRoot, panels: startup.panels }));
    checkedHandler('emd:startup-choice', async (value) => {
      if (!startupSupported) throw new Error('当前平台尚未实现专注启动布局。');
      await settings.setStartup(value);
      return publicSettings();
    });
    checkedHandler('emd:profile', async () => {
      const value = await settings.profile();
      if (!value) return null;
      const { ['profile-photo']: photo, ...profile } = value;
      const photoPath = path.isAbsolute(photo) ? photo : path.join(__dirname, '..', devUrl ? 'public' : 'dist', photo);
      const image = nativeImage.createFromBuffer(await fs.readFile(photoPath));
      if (image.isEmpty()) throw new Error(`头像图片无法读取：${photo}`);
      return { ...profile, photoUrl: image.toDataURL() };
    });
    checkedHandler('emd:profile-link', async (target) => {
      if (!['email', 'github', 'repository'].includes(target)) throw new Error('无效的资料链接。');
      const profile = await settings.profile();
      if (!profile) throw new Error('尚未配置个人资料。');
      await shell.openExternal(target === 'email' ? `mailto:${profile.email}` : profile[target]);
    });
    checkedHandler('emd:editor-choice', async (kind) => {
      editorKind(kind);
      const program = await chooseEditor(kind);
      if (program !== null) await settings.setEditor(kind, program);
      return publicSettings();
    });
    checkedHandler('emd:editor-clear', async (kind) => { await settings.setEditor(editorKind(kind), null); return publicSettings(); });
    checkedHandler('emd:edit-document', (id, choose) => editFile(getDocument(id).path, choose));
    checkedHandler('emd:edit-workspace', async (root, filePath) => {
      if (!workspaceRoots.has(root) || typeof filePath !== 'string') throw new Error('无效的工作区请求。');
      const canonical = await fs.realpath(filePath);
      if (!isWithin(root, canonical)) throw new Error('文件不在当前工作区内。');
      return editFile(canonical, false);
    });
    checkedHandler('emd:document-menu', (id, root) => {
      const document = getDocument(id);
      if (root !== undefined && !workspaceRoots.has(root)) throw new Error('无效的工作区请求。');
      Menu.buildFromTemplate([...editorMenu(document.path), { type: 'separator' }, ...pathMenu(document.path, root ?? path.dirname(document.path)), { type: 'separator' }, {
        label: commandSet.get('closeTab').label, click: () => { dispatchCommand('closeTab', id).catch(showError); },
      }]).popup({ window });
    });
    checkedHandler('emd:active-document', (id) => {
      if (id !== null) getDocument(id);
      activeDocumentId = id;
      updateCommandMenu();
      return Object.fromEntries(commandSet.items.map((command) => [command.id, commandEnabled(command.id)]));
    });
    checkedHandler('emd:workspace', async (id, requestedRoot) => {
      const document = id === null ? null : getDocument(id);
      if (requestedRoot !== undefined && !workspaceRoots.has(requestedRoot)) throw new Error('无效的工作区请求。');
      if (!document && requestedRoot === undefined) throw new Error('尚未打开工作区。');
      const context = document ? workspaceContext(document.path, requestedRoot) : { root: requestedRoot, activeAncestors: [] };
      const { root } = context;
      workspaceRoots.add(root);
      try { return await scanWorkspace(root, document?.path); }
      catch (error) { return { ...context, name: path.basename(root), nodes: null, error: error.message }; }
    });
    checkedHandler('emd:workspace-open', async (root, filePath, newTab, activeId) => {
      if (!workspaceRoots.has(root) || typeof filePath !== 'string' || typeof newTab !== 'boolean') throw new Error('无效的工作区请求。');
      const canonicalPath = await fs.realpath(filePath);
      if (!isWithin(root, canonicalPath)) throw new Error('文件不在当前工作区内。');
      const document = await readDocument(canonicalPath);
      if (!newTab) { getDocument(activeId); document.id = activeId; }
      documents.set(document.id, document);
      send('emd:document', publicDocument(document));
      return true;
    });
    checkedHandler('emd:workspace-menu', async (root, filePath, activeId) => {
      if (!workspaceRoots.has(root) || (filePath !== null && typeof filePath !== 'string')) throw new Error('无效的工作区请求。');
      const canonicalPath = filePath === null ? root : await fs.realpath(filePath);
      if (canonicalPath !== root && !isWithin(root, canonicalPath)) throw new Error('文件不在当前工作区内。');
      if (activeId !== null) getDocument(activeId);
      const isFile = filePath !== null && (await fs.stat(canonicalPath)).isFile();
      Menu.buildFromTemplate([
        ...(isFile ? [
          { label: '在当前标签页打开', click: () => send('emd:workspace-action', { action: 'open', path: canonicalPath }) },
          { label: '在新标签页打开', click: () => send('emd:workspace-action', { action: 'new-tab', path: canonicalPath }) },
          { type: 'separator' },
          ...editorMenu(canonicalPath), { type: 'separator' },
        ] : []),
        ...(filePath === null ? [{ label: '复制工作区路径', click: () => clipboard.writeText(root) }] : [
          ...pathMenu(canonicalPath, root),
          { label: '在文件管理器中显示', click: () => shell.showItemInFolder(canonicalPath) },
        ]),
        { type: 'separator' },
        { label: '重新载入工作树', click: () => send('emd:workspace-action', { action: 'refresh' }) },
      ]).popup({ window });
    });
    checkedHandler('emd:save', async (id) => {
      const document = getDocument(id);
      const result = await dialog.showSaveDialog(window, {
        title: document.kind === 'html' ? '另存为 HTML' : '另存为 Markdown', defaultPath: document.path,
        filters: [document.kind === 'html' ? { name: 'HTML', extensions: ['html', 'htm'] } : { name: 'Markdown', extensions: ['md', 'markdown'] }],
      });
      if (result.canceled) return null;
      await saveDocument(document, result.filePath);
      return result.filePath;
    });
    checkedHandler('emd:close', (id) => {
      getDocument(id);
      documents.delete(id);
      sessions.releaseUnused();
      if (id === activeDocumentId) activeDocumentId = null;
      updateCommandMenu();
    });
    checkedHandler('emd:reload', async (id) => {
      const old = getDocument(id);
      const document = await readDocument(old.path);
      document.id = id;
      documents.set(id, document);
      return publicDocument(document);
    });
    checkedHandler('emd:link', async (id, href) => {
      const document = getDocument(id);
      if (typeof href !== 'string') throw new Error('无效的链接。');
      if (/^(https?:|mailto:)/i.test(href)) { await shell.openExternal(href); return; }
      if (/^[a-z][a-z\d+.-]*:/i.test(href) && !href.startsWith('file:')) throw new Error('不支持此链接协议。');
      const filePath = href.startsWith('file:') ? require('node:url').fileURLToPath(href.split('#')[0]) : path.resolve(path.dirname(document.path), decodeURIComponent(href.split('#')[0]));
      await openPaths([filePath]);
      if (href.includes('#')) send('emd:anchor', decodeURIComponent(href.slice(href.indexOf('#') + 1)));
    });
    checkedHandler('emd:find', (text, forward) => {
      if (typeof text !== 'string' || typeof forward !== 'boolean') throw new Error('无效的查找请求。');
      if (text) window.webContents.findInPage(text, { forward, findNext: true });
      else window.webContents.stopFindInPage('clearSelection');
    });
    window.once('ready-to-show', () => {
      if (process.platform === 'win32' && placement?.geometry) window.setBounds(placement.geometry);
      window.show();
    });
    await window.loadURL(appUrl);
    await openPaths(fileArguments(process.argv, process.cwd()));
  }).catch((error) => { console.error(error); dialog.showErrorBox('emd 启动失败', error.message); app.exit(1); });
}
