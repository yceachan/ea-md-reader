const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { countDocuments, geometry, context } = require('../electron/platforms/kde-startup.cjs');
const { settingsStore } = require('../electron/settings.cjs');
const vm = require('node:vm');

test('启动计数统一 Markdown/HTML，仅当前层，不计目录或其他文件', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-startup-count-'));
  try {
    assert.equal(await countDocuments(root), 0);
    assert.deepEqual((await context('default', root)).panels, { left: true, right: true });
    assert.deepEqual((await context('focus', root)).panels, { left: false, right: false });
    await fs.mkdir(path.join(root, 'child')); await fs.writeFile(path.join(root, 'child', 'child.md'), '# 子文档');
    await fs.writeFile(path.join(root, 'README.MD'), '# 正文');
    assert.equal(await countDocuments(root), 1);
    assert.deepEqual((await context('focus', root)).panels, { left: false, right: false });
    await fs.writeFile(path.join(root, 'page.htm'), '<h1>页面</h1>');
    await fs.writeFile(path.join(root, 'notes.txt'), '其他');
    assert.equal(await countDocuments(root), 2);
    const startup = await context('focus', root);
    assert.deepEqual(startup.panels, { left: true, right: false });
    assert.equal(startup.workspace, true);
    assert.equal(startup.root, await fs.realpath(root));
    assert.throws(() => geometry('focus', startup.count, { x: 0, y: 0, width: 1000, height: 800 }), /最小尺寸/);
    assert.deepEqual(startup.panels, { left: true, right: false });
    await assert.rejects(countDocuments(path.join(root, 'missing')), /ENOENT/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('默认及零文档居中，单/多文档右侧全高度，尺寸不足报错', () => {
  const area = { x: -1600, y: -100, width: 1600, height: 1000 };
  assert.deepEqual(geometry('default', 5, area), { x: -1390, y: -25, width: 1180, height: 850 });
  assert.deepEqual(geometry('focus', 0, area), geometry('default', 0, area));
  assert.deepEqual(geometry('focus', 1, area), { x: -620, y: -100, width: 620, height: 1000 });
  assert.deepEqual(geometry('focus', 2, area), { x: -800, y: -100, width: 800, height: 1000 });
  assert.deepEqual(geometry('default', 0, { x: 0, y: 0, width: 1000.5, height: 700.5 }), { x: 0, y: 0, width: 1000, height: 700 });
  assert.throws(() => geometry('focus', 2, { ...area, width: 1200 }), /最小尺寸/);
});

test('启动偏好持久化并保留编辑器和 profile，非法模式不覆盖文件', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-startup-settings-'));
  try {
    const file = path.join(root, 'setting.toml'), store = settingsStore(file);
    await fs.writeFile(file, '[profile]\nname="yceachan"\n');
    await store.setStartup('focus');
    await store.setEditor('html', path.join(root, 'editor'));
    assert.equal((await settingsStore(file).get()).startup.layout, 'focus');
    assert.ok((await fs.readFile(file, 'utf8')).includes('yceachan'));
    const before = await fs.readFile(file, 'utf8');
    await assert.rejects(store.setStartup('right-dock'), /无效/);
    assert.equal(await fs.readFile(file, 'utf8'), before);
    await fs.writeFile(file, '[startup]\nlayout="invalid"\n');
    await assert.rejects(store.get(), /无效/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('KWin 按鼠标输出匹配本次主窗口，几何确认后显示并停止监听', async () => {
  const signal = () => {
    const callbacks = new Set();
    return { connect: (fn) => callbacks.add(fn), disconnect: (fn) => callbacks.delete(fn), emit: (...args) => [...callbacks].forEach((fn) => fn(...args)), size: () => callbacks.size };
  };
  const activeOutput = { name: 'active' }, pointerOutput = { name: 'pointer' };
  const area = { x: -1600, y: 0, width: 1600, height: 1000 }, messages = [];
  const cursor = { x: -800, y: 500 };
  const workspace = {
    activeWindow: { output: activeOutput }, cursorPos: cursor, screens: [activeOutput, pointerOutput], windowAdded: signal(),
    screenAt: (point) => { assert.equal(point, cursor); return pointerOutput; },
    currentDesktopForScreen: () => 1,
    clientArea: (_, output) => { assert.equal(output, pointerOutput); return area; },
    sendClientToScreen: (window, output) => { window.output = output; },
  };
  const request = { pid: 123, layout: 'focus', count: 2, defaults: { width: 1180, height: 850 }, minimum: { width: 620, height: 440 }, service: 'test', plugin: 'test' };
  const template = await fs.readFile(path.join(__dirname, '../electron/platforms/kde-startup.js'), 'utf8');
  vm.runInNewContext(template.replace('__REQUEST__', JSON.stringify(request)).replace('__GEOMETRY__', geometry.toString()), {
    workspace, KWin: { MaximizeArea: 0 }, QTimer: function () { this.timeout = signal(); this.start = () => {}; },
    callDBus: (_, __, ___, method, message) => { if (method === 'Report') messages.push(JSON.parse(message)); },
  });
  const other = { pid: 999, normalWindow: true, opacity: 1 };
  workspace.windowAdded.emit(other);
  assert.equal(other.output, undefined);
  workspace.windowAdded.emit({ pid: 123, normalWindow: true, dialog: true });
  const window = { pid: 123, normalWindow: true, opacity: 1, frameGeometryChanged: signal() };
  let pendingGeometry;
  Object.defineProperty(window, 'frameGeometry', { get: () => window.actual, set: (value) => { pendingGeometry = value; } });
  window.actual = { x: 0, y: 0, width: 620, height: 440 };
  workspace.windowAdded.emit(window);
  assert.equal(window.output, pointerOutput);
  assert.equal(window.opacity, 0);
  assert.equal(messages.length, 1);
  window.actual = pendingGeometry;
  window.frameGeometryChanged.emit();
  assert.equal(window.opacity, 1);
  assert.equal(messages[1].event, 'applied');
  assert.equal(messages[1].output, 'pointer');
  assert.equal(workspace.windowAdded.size(), 0);
  assert.equal(window.frameGeometryChanged.size(), 0);
});
