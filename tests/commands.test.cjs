const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createCommandSet, consumeInput } = require('../electron/commands.cjs');
const { selectPlatform } = require('../electron/platforms/index.cjs');
const { isWithin, workspaceContext } = require('../electron/files.cjs');
const input = (key, modifiers = {}) => ({ type: 'keyDown', key, ...modifiers });

for (const host of ['linux', 'win32', 'darwin']) {
  test(`${host} 命令映射保留主要键、精确修饰键与共同 Ctrl+Tab`, () => {
    const commands = createCommandSet(selectPlatform(host).keyboard);
    const primary = host === 'darwin' ? 'meta' : 'control';
    const secondary = host === 'darwin' ? 'control' : 'meta';
    for (const [key, id] of [['o', 'openDocument'], ['w', 'closeTab'], ['r', 'reloadDocument'], ['f', 'findInDocument'], ['q', 'quit']]) {
      assert.equal(commands.match(input(key, { [primary]: true })), id);
      assert.equal(commands.match(input(key, { [secondary]: true })), null);
      assert.equal(commands.match(input(key, { [primary]: true, shift: true })), null);
      assert.equal(commands.match(input(key, { [primary]: true, alt: true })), null);
    }
    assert.equal(commands.match(input('s', { [primary]: true, shift: true })), 'saveAs');
    assert.equal(commands.match(input('s', { [primary]: true })), 'saveSource');
    assert.equal(commands.match(input('/', { control: true })), 'toggleEdit');
    assert.equal(commands.match(input('tab', { control: true })), 'nextTab');
    assert.equal(commands.match(input('tab', { control: true, shift: true })), 'previousTab');
    assert.equal(commands.match(input('tab', { meta: true })), null);
    assert.equal(commands.match(input('f', { alt: true })), 'toggleFileMenu');
    assert.equal(commands.match(input('f', { alt: true, shift: true })), null);
    assert.equal(commands.match(input('f', { control: true, meta: true })), host === 'darwin' ? 'toggleFullscreen' : null);
    assert.equal(commands.match(input('f11')), host === 'darwin' ? null : 'toggleFullscreen');
    assert.equal(commands.match(input('f11', { control: true })), null);
    assert.equal(commands.match(input('f12')), 'openDeveloperTools');
    assert.equal(commands.match(input('f12', { [primary]: true })), null);
    for (const key of ['c', 'v', 'a', 'x']) assert.equal(commands.match(input(key, { [primary]: true })), null);
    assert.equal(commands.hints.openDocument, host === 'darwin' ? 'Cmd+O' : 'Ctrl+O');
    assert.equal(commands.get('openDocument').accelerator, host === 'darwin' ? 'Command+O' : 'Control+O');
    assert.equal(commands.hints.toggleFullscreen, host === 'darwin' ? 'Ctrl+Cmd+F' : 'F11');
    assert.equal(commands.match({ ...input('o', { [primary]: true }), isComposing: true }), null);
    assert.equal(commands.match({ ...input('o', { [primary]: true }), type: 'keyUp' }), null);
    assert.throws(() => commands.get('not-a-command'), /无效/);
  });
  test(`${host} 主键盘与小键盘缩放不消费无关 Shift 组合`, () => {
    const commands = createCommandSet(selectPlatform(host).keyboard);
    const primary = { [host === 'darwin' ? 'meta' : 'control']: true };
    for (const key of ['+', '=']) assert.equal(commands.match(input(key, primary)), 'zoomIn');
    for (const key of ['+', '=']) assert.equal(commands.match(input(key, { ...primary, shift: true })), 'zoomIn');
    assert.equal(commands.match({ ...input('+', primary), code: 'NumpadAdd' }), 'zoomIn');
    assert.equal(commands.match({ ...input('-', primary), code: 'NumpadSubtract' }), 'zoomOut');
    assert.equal(commands.match(input('0', primary)), 'zoomReset');
    for (const key of ['-', '_', '0']) assert.equal(commands.match(input(key, { ...primary, shift: true })), null);
    assert.equal(commands.match(input('+', { ...primary, alt: true })), null);
  });
}

test('键盘消费一次并让复制键继续进入原生菜单与输入框', () => {
  const commands = createCommandSet(selectPlatform('darwin').keyboard);
  let prevented = 0;
  const dispatched = [];
  const event = { preventDefault() { prevented++; } };
  const dispatch = (id) => dispatched.push(id);
  assert.equal(consumeInput(event, input('o', { meta: true }), commands, dispatch), true);
  assert.equal(consumeInput(event, { ...input('o', { meta: true }), type: 'keyUp' }, commands, dispatch), false);
  assert.equal(consumeInput(event, input('c', { meta: true }), commands, dispatch), false);
  assert.equal(prevented, 1);
  assert.deepEqual(dispatched, ['openDocument']);
});

test('POSIX 和 Windows 根目录及祖先使用 Node 路径语义', () => {
  for (const [paths, root, nested, ancestors, outside] of [
    [path.posix, '/docs', '/docs/章/节/a.md', ['/docs/章/节', '/docs/章', '/docs'], '/docs-other/a.md'],
    [path.win32, 'C:\\docs', 'C:\\docs\\章\\节\\a.md', ['C:\\docs\\章\\节', 'C:\\docs\\章', 'C:\\docs'], 'C:\\docs-other\\a.md'],
    [path.win32, '\\\\server\\share\\docs', '\\\\server\\share\\docs\\章\\a.md', ['\\\\server\\share\\docs\\章', '\\\\server\\share\\docs'], '\\\\server\\other\\a.md'],
  ]) {
    assert.deepEqual(workspaceContext(nested, root, paths), { root, activeAncestors: ancestors });
    assert.equal(isWithin(root, outside, paths), false);
    assert.equal(workspaceContext(outside, root, paths).root, paths.dirname(outside));
    assert.equal(isWithin(root, root, paths), false);
  }
  assert.equal(workspaceContext('D:\\other\\a.html', 'C:\\docs', path.win32).root, 'D:\\other');
  assert.deepEqual(workspaceContext('C:\\a.md', undefined, path.win32), { root: 'C:\\', activeAncestors: ['C:\\'] });
});
