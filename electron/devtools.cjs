const { BrowserWindow } = require('electron');

function developerTools(owner) {
  let tools = null;
  function destroy() {
    const current = tools;
    tools = null;
    if (current && !current.isDestroyed()) current.destroy();
  }
  owner.once('closed', destroy);
  owner.webContents.on('devtools-closed', () => {
    // A delayed close event from the previous frontend must not close its successor.
    if (!owner.webContents.isDevToolsOpened()) destroy();
  });
  return () => {
    if (tools && !tools.isDestroyed() && !tools.webContents.isDestroyed()) {
      if (tools.isMinimized()) tools.restore();
      tools.show(); tools.focus();
      return;
    }
    if (owner.isDestroyed()) return;
    destroy();
    const current = new BrowserWindow({ width: 1000, height: 700, show: false, title: '开发者控制台', autoHideMenuBar: true });
    tools = current;
    current.on('close', (event) => {
      event.preventDefault();
      if (tools === current) tools = null;
      if (!owner.isDestroyed()) owner.webContents.closeDevTools();
      if (!current.isDestroyed()) current.destroy();
    });
    owner.webContents.setDevToolsWebContents(current.webContents);
    owner.webContents.openDevTools({ mode: 'detach' });
    current.show(); current.focus();
  };
}
module.exports = { developerTools };
