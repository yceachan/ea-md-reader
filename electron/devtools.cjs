const { BrowserWindow } = require('electron');

function developerTools(owner) {
  const contents = owner.webContents;
  let tools = null;
  let closed = Promise.resolve();
  let ready = Promise.resolve();
  function destroy() {
    const current = tools;
    tools = null;
    if (current && !current.isDestroyed()) current.destroy();
  }
  owner.once('closed', destroy);
  async function open() {
    if (tools && !tools.isDestroyed() && !tools.webContents.isDestroyed()) {
      if (tools.isMinimized()) tools.restore();
      tools.show(); tools.focus();
      return tools;
    }
    // Native frontend destruction can precede the owner's devtools-closed event.
    // Do not register a successor until the previous close event is consumed.
    await closed;
    if (owner.isDestroyed()) return;
    if (tools && !tools.isDestroyed() && !tools.webContents.isDestroyed()) {
      tools.show(); tools.focus(); return tools;
    }
    destroy();
    const current = new BrowserWindow({ width: 1000, height: 700, show: false, title: '开发者控制台', autoHideMenuBar: true });
    tools = current;
    let frontendReady;
    ready = new Promise((resolve) => { frontendReady = resolve; });
    contents.once('devtools-opened', frontendReady);
    closed = new Promise((resolve) => {
      const finish = () => {
        contents.removeListener('devtools-opened', frontendReady);
        frontendReady();
        contents.removeListener('devtools-closed', finish);
        owner.removeListener('closed', finish);
        if (tools === current) tools = null;
        if (!current.isDestroyed()) current.destroy();
        resolve();
      };
      contents.once('devtools-closed', finish);
      owner.once('closed', finish);
    });
    current.on('close', (event) => {
      event.preventDefault();
      if (!owner.isDestroyed()) contents.closeDevTools();
      if (!current.isDestroyed()) current.destroy();
    });
    contents.setDevToolsWebContents(current.webContents);
    contents.openDevTools({ mode: 'detach' });
    current.show(); current.focus();
    return current;
  }
  return async (inspect = false) => {
    const current = await open();
    if (!inspect || !current) return;
    await ready;
    if (current.isDestroyed() || current.webContents.isDestroyed()) return;
    await current.webContents.executeJavaScript('DevToolsAPI.enterInspectElementMode()');
  };
}
module.exports = { developerTools };
