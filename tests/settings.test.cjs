const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { parse } = require('smol-toml');
const { settingsStore } = require('../electron/settings.cjs');

test('编辑器 TOML 配置分别持久化，清除时保留其他编辑器与分区', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-settings-'));
  try {
    const file = path.join(root, 'setting.toml');
    const settings = settingsStore(file);
    assert.deepEqual(await settings.get(), { editors: { markdown: null, html: null } });
    await fs.writeFile(file, '[reading]\nscale = 2\n');
    const markdown = path.join(root, '中文 空格 "程序"');
    const html = path.join(root, 'html-editor');
    await settings.setEditor('markdown', markdown);
    await settings.setEditor('html', html);
    assert.deepEqual(await settingsStore(file).get(), { editors: { markdown: { program: markdown }, html: { program: html } } });
    await settings.setEditor('markdown', null);
    const saved = parse(await fs.readFile(file, 'utf8'));
    assert.equal(saved.reading.scale, 2);
    assert.deepEqual(Object.keys(saved.editors), ['html']);
    assert.equal(saved.editors.html.program, html);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('损坏配置和非法编辑器类型明确失败，不覆盖原始配置', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-settings-error-'));
  try {
    const file = path.join(root, 'setting.toml');
    const settings = settingsStore(file);
    for (const text of ['editors = [', 'editors = []', '[editors.markdown]\nprogram = "relative"']) {
      await fs.writeFile(file, text);
      await assert.rejects(settings.get());
      await assert.rejects(settings.setEditor('markdown', path.join(root, 'editor')));
      assert.equal(await fs.readFile(file, 'utf8'), text);
    }
    await assert.rejects(settings.setEditor('other', null), /无效/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
