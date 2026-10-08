module.exports = {
  chooseEditor: require('./windows-editor.cjs').chooseEditor,
  validateEditor: require('./editor.cjs').validateExecutable,
  startEditor: require('./editor.cjs').startExecutable,
  keyboard: require('./control-keyboard.cjs'),
  createFullscreenToggle(window) {
    // Electron 44's transparent Windows window changes bounds and emits events,
    // but isFullScreen() still reads the unchanged native widget state.
    let fullscreen = false;
    window.on('enter-full-screen', () => { fullscreen = true; });
    window.on('leave-full-screen', () => { fullscreen = false; });
    return () => window.setFullScreen(!fullscreen);
  },
  install() {},
  createMenu() { return null; },
};
