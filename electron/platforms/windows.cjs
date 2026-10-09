module.exports = {
  chooseEditor: require('./windows-editor.cjs').chooseEditor,
  validateEditor: require('./editor.cjs').validateExecutable,
  startEditor: require('./editor.cjs').startExecutable,
  keyboard: require('./control-keyboard.cjs'),
  startupLayout: require('./windows-startup.cjs'),
  windowOptions: {
    frame: true, transparent: false, backgroundColor: '#fdfdf7',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#fdfdf7', symbolColor: '#a45d47', height: 56 },
    minWidth: 330, minHeight: 240,
  },
  createFullscreenToggle: require('./fullscreen.cjs'),
  install() {},
  createMenu() { return null; },
};
