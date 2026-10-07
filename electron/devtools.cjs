const { BrowserWindow } = require('electron');

function developerTools(owner) {
  let tools = null;
  function destroy() {
    const current = tools;
    tools = null;
    if (current && !current.isDestroyed()) current.destroy();
  }
  owner.webContents.on('devtools-closed', destroy);
  owner.once('closed', destroy);
  return () => {
    if (tools) {
      if (tools.isMinimized()) tools.restore();
      tools.show(); tools.focus();
      return;
    }
    const current = new BrowserWindow({ width: 1000, height: 700, show: false, title: '开发者控制台', autoHideMenuBar: true });
    tools = current;
    current.once('closed', () => {
      if (tools === current) {
        tools = null;
        if (!owner.isDestroyed()) owner.webContents.closeDevTools();
      }
    });
    owner.webContents.setDevToolsWebContents(current.webContents);
    owner.webContents.openDevTools({ mode: 'detach' });
    current.show(); current.focus();
  };
}
module.exports = { developerTools };
