module.exports = {
  validateEditor: require('./editor.cjs').validateExecutable,
  startEditor: require('./editor.cjs').startExecutable,
  keyboard: require('./control-keyboard.cjs'),
  createFullscreenToggle: require('./fullscreen.cjs'),
  install(app) { app.setDesktopName('io.github.yceachan.emd.desktop'); },
  createMenu() { return null; },
};
