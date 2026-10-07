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
    async profile() {
      const value = (await read()).profile;
      if (value === undefined) return null;
      const fields = ['name', 'tagline', 'email', 'github', 'repository', 'copyright', 'license', 'profile-photo'];
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('setting.toml 的 profile 必须是表。');
      for (const field of fields) if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`setting.toml 的 profile.${field} 必须是非空文本。`);
      if (!/^[^\s@?]+@[^\s@?]+$/.test(value.email)) throw new Error('profile.email 必须是有效的邮箱地址。');
      for (const field of ['github', 'repository']) {
        let url;
        try { url = new URL(value[field]); } catch { throw new Error(`profile.${field} 必须是 HTTP / HTTPS 地址。`); }
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`profile.${field} 必须是 HTTP / HTTPS 地址。`);
      }
      return Object.fromEntries(fields.map((field) => [field, value[field]]));
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
