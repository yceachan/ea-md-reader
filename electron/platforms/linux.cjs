module.exports = {
  startupLayout: require('./kde-startup.cjs'),
  validateEditor: require('./linux-editor.cjs').validateEditor,
  startEditor: require('./linux-editor.cjs').startEditor,
  chooseEditor: require('./linux-editor.cjs').chooseEditor,
  keyboard: require('./control-keyboard.cjs'),
  createFullscreenToggle: require('./fullscreen.cjs'),
  install(app) { app.setDesktopName('io.github.yceachan.emd.desktop'); },
  createMenu() { return null; },
};
