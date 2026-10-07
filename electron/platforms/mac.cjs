module.exports = {
  validateEditor: require('./editor.cjs').validateMacEditor,
  startEditor: require('./editor.cjs').startMacEditor,
  createFullscreenToggle: require('./fullscreen.cjs'),
  keyboard: {
    primary: { input: 'meta', accelerator: 'Command', hint: 'Cmd' },
    altHint: 'Option', fullscreen: { key: 'F', modifiers: ['Control', 'Primary'] },
  },
  install(app, { openFiles, focusWindow }) {
    app.on('open-file', (event, filePath) => { event.preventDefault(); openFiles([filePath]); focusWindow(); });
    app.on('activate', focusWindow);
  },
  createMenu({ Menu, commandItem }) {
    return Menu.buildFromTemplate([
      { role: 'appMenu', submenu: [
        { role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, commandItem('quit'),
      ] },
      { label: '文件', submenu: [...['openDocument', 'saveAs', 'closeTab', 'reloadDocument', 'toggleFileMenu'].map(commandItem), { type: 'separator' }, commandItem('openSettings')] },
      { role: 'editMenu', submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' },
        { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' },
        { type: 'separator' }, commandItem('findInDocument'),
      ] },
      { label: '视图', submenu: ['zoomIn', 'zoomOut', 'zoomReset', 'toggleFullscreen', 'openDeveloperTools'].map(commandItem) },
      { role: 'windowMenu', submenu: [
        { role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, commandItem('nextTab'), commandItem('previousTab'),
      ] },
    ]);
  },
};
