const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parse, stringify } = require('smol-toml');

function editorKind(kind) {
  if (!['markdown', 'html'].includes(kind)) throw new Error('无效的编辑器类型。');
  return kind;
}
function startupLayout(layout) {
  if (!['default', 'focus'].includes(layout)) throw new Error('无效的启动布局。');
  return layout;
}

function settingsStore(file) {
  async function read() {
    let text;
    try { text = await fs.readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    const value = parse(text);
    if (value.startup !== undefined && (!value.startup || typeof value.startup !== 'object' || Array.isArray(value.startup))) throw new Error('setting.toml 的 startup 必须是表。');
    if (value.startup?.layout !== undefined) startupLayout(value.startup.layout);
    if (value.editors !== undefined && (!value.editors || typeof value.editors !== 'object' || Array.isArray(value.editors))) throw new Error('setting.toml 的 editors 必须是表。');
    for (const kind of ['markdown', 'html']) {
      const editor = value.editors?.[kind];
      if (editor !== undefined && (!editor || typeof editor.program !== 'string' || !path.isAbsolute(editor.program))) throw new Error(`setting.toml 的 editors.${kind}.program 必须是程序绝对路径。`);
    }
    return value;
  }
  function publicSettings(value) {
    const editor = (kind) => value.editors?.[kind] ? { program: value.editors[kind].program } : null;
    return { editors: { markdown: editor('markdown'), html: editor('html') }, startup: { layout: value.startup?.layout ?? 'default' } };
  }
  async function write(value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, stringify(value), { flag: 'wx' });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
    return publicSettings(value);
  }
  return {
    async get() { return publicSettings(await read()); },
    async setStartup(layout) {
      startupLayout(layout);
      const value = await read();
      value.startup ??= {};
      value.startup.layout = layout;
      return write(value);
    },
    async setEditor(kind, program) {
      editorKind(kind);
      const value = await read();
      value.editors ??= {};
      if (program === null) delete value.editors[kind];
      else value.editors[kind] = { program };
      return write(value);
    },
  };
}

module.exports = { settingsStore, editorKind };
