// Application commands use semantic modifiers. Ports supply the real keyboard mapping.
const definitions = [
  { id: 'openDocument', label: '打开…', key: 'O', modifiers: ['Primary'] },
  { id: 'saveAs', label: '另存为…', key: 'S', modifiers: ['Primary', 'Shift'], requiresDocument: true },
  { id: 'closeTab', label: '关闭标签页', key: 'W', modifiers: ['Primary'], requiresDocument: true },
  { id: 'reloadDocument', label: '重新读取文件', key: 'R', modifiers: ['Primary'], requiresDocument: true },
  { id: 'findInDocument', label: '查找', key: 'F', modifiers: ['Primary'], requiresDocument: true },
  { id: 'nextTab', label: '下一个标签页', key: 'Tab', modifiers: ['Control'], requiresDocument: true },
  { id: 'previousTab', label: '上一个标签页', key: 'Tab', modifiers: ['Control', 'Shift'], requiresDocument: true },
  { id: 'quit', label: '退出', key: 'Q', modifiers: ['Primary'] },
  { id: 'zoomIn', label: '放大', key: '+', modifiers: ['Primary'] },
  { id: 'zoomOut', label: '缩小', key: '-', modifiers: ['Primary'] },
  { id: 'zoomReset', label: '恢复原始大小', key: '0', modifiers: ['Primary'] },
  { id: 'toggleFullscreen', label: '全屏', platformBinding: 'fullscreen' },
  { id: 'toggleFileMenu', label: '文件菜单', key: 'F', modifiers: ['Alt'] },
  { id: 'openDeveloperTools', label: '开发者控制台', key: 'F12', modifiers: [] },
  { id: 'openSettings', label: '设置…' },
];

function createCommandSet(keyboard) {
  const modifiers = {
    Primary: keyboard.primary,
    Control: { input: 'control', accelerator: 'Control', hint: 'Ctrl' },
    Shift: { input: 'shift', accelerator: 'Shift', hint: 'Shift' },
    Alt: { input: 'alt', accelerator: 'Alt', hint: keyboard.altHint },
  };
  const items = definitions.map((definition) => {
    if (!definition.key && !definition.platformBinding) return { ...definition, hint: '' };
    const binding = definition.platformBinding ? keyboard[definition.platformBinding] : definition;
    const mapped = binding.modifiers.map((name) => modifiers[name]);
    return { ...definition, key: binding.key, inputModifiers: mapped.map((item) => item.input),
      accelerator: [...mapped.map((item) => item.accelerator), binding.key === '+' ? 'Plus' : binding.key].join('+'),
      hint: [...mapped.map((item) => item.hint), binding.key].join('+') };
  });
  const commands = new Map(items.map((item) => [item.id, item]));
  function get(id) {
    const command = commands.get(id);
    if (!command) throw new Error(`无效的应用命令：${id}`);
    return command;
  }
  function match(input) {
    if (input.type !== 'keyDown' || input.isComposing) return null;
    const key = input.key.toLowerCase();
    return items.find((command) => {
      if (!command.key) return false;
      const plus = command.id === 'zoomIn';
      const keyMatches = plus ? ['+', '='].includes(key) : key === command.key.toLowerCase();
      if (!keyMatches) return false;
      return ['control', 'meta', 'alt', 'shift'].every((modifier) => {
        // A main keyboard plus needs Shift; a keypad plus does not.
        if (plus && modifier === 'shift') return true;
        return !!input[modifier] === command.inputModifiers.includes(modifier);
      });
    })?.id ?? null;
  }
  return { items, get, match, hints: Object.fromEntries(items.map(({ id, hint }) => [id, hint])) };
}

function consumeInput(event, input, commands, dispatch) {
  const id = commands.match(input);
  if (!id) return false;
  // Electron prevents the renderer event and the menu accelerator together.
  event.preventDefault();
  dispatch(id);
  return true;
}

module.exports = { createCommandSet, consumeInput };
