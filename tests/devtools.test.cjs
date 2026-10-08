const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('DevTools 原生关闭事件晚到时等待关闭，合并并发重开且随 Reader 销毁', async () => {
  const windows = [];
  class Window extends EventEmitter {
    constructor() {
      super(); windows.push(this); this.destroyed = false;
      this.webContents = { isDestroyed: () => this.destroyed };
    }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    show() { this.visible = true; }
    focus() {}
    destroy() { this.destroyed = true; this.emit('closed'); }
    close() { this.emit('close', { preventDefault() {} }); }
  }
  const contents = new EventEmitter();
  let opened = 0, requestedClose = 0;
  contents.setDevToolsWebContents = () => {};
  contents.openDevTools = () => { opened++; };
  contents.closeDevTools = () => { requestedClose++; };
  const owner = new EventEmitter(); owner.webContents = contents;
  let destroyed = false; owner.isDestroyed = () => destroyed;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/devtools.cjs'), 'utf8'), {
    module, require: name => { assert.equal(name, 'electron'); return { BrowserWindow: Window }; },
  });
  const open = module.exports.developerTools(owner);
  await open(); await open();
  assert.equal(windows.length, 1);
  windows[0].close();
  assert.equal(requestedClose, 1);
  assert.equal(windows[0].destroyed, true);
  const next = Promise.all([open(), open()]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(windows.length, 1, 'native close acknowledgement must precede new frontend');
  contents.emit('devtools-closed');
  await next;
  assert.equal(windows.length, 2);
  assert.equal(opened, 2);
  assert.equal(windows[1].destroyed, false);
  destroyed = true; owner.emit('closed');
  assert.equal(windows[1].destroyed, true);
  assert.equal(contents.listenerCount('devtools-closed'), 0);
  await open();
  assert.equal(windows.length, 2);
});
