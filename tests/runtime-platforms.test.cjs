const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { selectPlatform } = require('../electron/platforms/index.cjs');
const { createCommandSet } = require('../electron/commands.cjs');

test('桌面平台选择明确，Linux 身份与 macOS 文件打开和激活各自归属', () => {
  assert.throws(() => selectPlatform('android'), /不支持/);
  const app = new EventEmitter();
  const identities = [], opened = [];
  let focused = 0, prevented = 0;
  app.setDesktopName = (name) => identities.push(name);
  const context = { openFiles: (files) => opened.push(files), focusWindow: () => focused++ };
  selectPlatform('linux').install(app, context);
  assert.deepEqual(identities, ['io.github.yceachan.emd.desktop']);
  assert.equal(app.listenerCount('open-file'), 0);
  selectPlatform('win32').install(app, context);
  assert.equal(app.listenerCount('activate'), 0);
  selectPlatform('darwin').install(app, context);
  app.emit('open-file', { preventDefault() { prevented++; } }, '/documents/中文.md');
  app.emit('activate');
  assert.deepEqual(opened, [['/documents/中文.md']]);
  assert.equal(prevented, 1);
  assert.equal(focused, 2);
});

test('macOS 菜单使用同一命令配置，关闭标签与退出不重复设置原生角色', () => {
  const port = selectPlatform('darwin');
  const commands = createCommandSet(port.keyboard);
  const called = [];
  const menu = port.createMenu({ Menu: { buildFromTemplate: (template) => template }, commandItem: (id) => ({
    id, accelerator: commands.get(id).accelerator, click: () => called.push(id),
  }) });
  const items = menu.flatMap((group) => group.submenu);
  const actions = items.filter((item) => item.id);
  assert.deepEqual(actions.map((item) => item.id).toSorted(), commands.items.map((item) => item.id).toSorted());
  assert.equal(items.some((item) => ['quit', 'close', 'togglefullscreen', 'zoomin', 'zoomout'].includes(item.role)), false);
  actions.find((item) => item.id === 'closeTab').click();
  assert.deepEqual(called, ['closeTab']);
  assert.ok(items.some((item) => item.role === 'copy'));
  assert.ok(items.some((item) => item.role === 'paste'));
  assert.equal(selectPlatform('linux').createMenu(), null);
  assert.equal(selectPlatform('win32').createMenu(), null);
});
