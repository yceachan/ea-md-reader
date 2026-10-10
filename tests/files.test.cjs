const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readDocument, publicDocument, saveDocument, saveSource, fileArguments, scanWorkspace, isWithin } = require('../electron/files.cjs');

test('源码保存保留 BOM / 换行 / 文件权限，缩短后截断，外部修改与旧版本均拒绝覆盖', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-source-save-')));
  try {
    const file = path.join(directory, '源码.md');
    for (const [bom, newline] of [['\ufeff', '\r\n'], ['', '\n']]) {
      await fs.writeFile(file, `${bom}# 原始文档${newline}${newline}较长的原文。${newline}`, { mode: 0o640 });
      const original = await readDocument(file), revision = publicDocument(original).revision;
      const saved = await saveSource(original, '# 新\n', revision);
      assert.deepEqual(await fs.readFile(file), Buffer.from(`${bom}# 新${newline}`));
      assert.deepEqual(saved.bytes, await fs.readFile(file));
      assert.equal(saved.id, original.id);
      if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o640);
      assert.notEqual(publicDocument(saved).revision, revision);
      await assert.rejects(saveSource(saved, '# 旧草稿', revision), /保存冲突/);
      await fs.writeFile(file, '# 外部更新\n');
      await assert.rejects(saveSource(saved, '# 本地草稿', publicDocument(saved).revision), /保存冲突/);
      assert.equal(await fs.readFile(file, 'utf8'), '# 外部更新\n');
      await fs.rm(file);
      await assert.rejects(saveSource(saved, '# 草稿', publicDocument(saved).revision), /ENOENT/);
    }
    const html = path.join(directory, '页面.html'); await fs.writeFile(html, '<h1>原始</h1>');
    const document = await readDocument(html);
    await assert.rejects(saveSource(document, '改动', publicDocument(document).revision), /无效/);
    assert.equal(await fs.readFile(html, 'utf8'), '<h1>原始</h1>');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('UTF-8 原始字节另存为，禁止覆盖源文件及其硬链接', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-files-')));
  try {
    const source = path.join(directory, '有 空格.md');
    const bytes = Buffer.from('\ufeff---\r\ntitle: 示例\r\n---\r\n# 标题\r\n');
    await fs.writeFile(source, bytes);
    const document = await readDocument(source);
    const destination = path.join(directory, '副本.md');
    await saveDocument(document, destination);
    assert.deepEqual(await fs.readFile(destination), bytes);
    await assert.rejects(saveDocument(document, source), /不能覆盖自身/);
    const alias = path.join(directory, '别名.md');
    await fs.link(source, alias);
    await assert.rejects(saveDocument(document, alias), /不能覆盖自身/);
    assert.deepEqual(await fs.readFile(source), bytes);
    await fs.writeFile(path.join(directory, 'invalid.md'), Buffer.from([0xff]));
    await assert.rejects(readDocument(path.join(directory, 'invalid.md')), /encoded data/);
    await assert.rejects(readDocument(path.join(directory, 'missing.md')), /ENOENT/);
    await assert.rejects(readDocument(path.join(directory, 'file.txt')), /Markdown/);
    assert.deepEqual(fileArguments(['emd', '--flag', '有 空格.md', '--', '-literal.md'], directory), [source, path.join(directory, '-literal.md')]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('HTML 原始字节另存为与文件 URL 参数', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-html-files-')));
  try {
    for (const extension of ['.html', '.HTM']) {
      const source = path.join(directory, `页面 空格${extension}`);
      const bytes = Buffer.from('\ufeff<!doctype html>\r\n<style>body{color:red}</style><script>window.count=1</script>');
      await fs.writeFile(source, bytes);
      const document = await readDocument(source);
      assert.equal(document.kind, 'html');
      const exposed = publicDocument(document);
      assert.equal(exposed.bytes, undefined);
      assert.equal(new URL(exposed.pageUrl).host, document.id);
      assert.notEqual(exposed.pageUrl, publicDocument(document).pageUrl);
      const destination = path.join(directory, `副本${extension}`);
      await saveDocument(document, destination);
      assert.deepEqual(await fs.readFile(destination), bytes);
      await assert.rejects(saveDocument(document, source), /不能覆盖自身/);
      assert.deepEqual(fileArguments(['emd', require('node:url').pathToFileURL(source).href], directory), [source]);
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('工作区递归筛选 Markdown 和 HTML，剪去空目录，不遍历符号链接目录', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-tree-')));
  try {
    await fs.mkdir(path.join(directory, '章节', '子目录'), { recursive: true });
    await fs.mkdir(path.join(directory, '无文档'));
    await fs.writeFile(path.join(directory, '入口.md'), '# 入口');
    await fs.writeFile(path.join(directory, '章节', '子目录', '正文.MARKDOWN'), '# 正文');
    await fs.writeFile(path.join(directory, '章节', '页面.HTML'), '<h1>页面</h1>');
    await fs.writeFile(path.join(directory, '章节', '子目录', '网页.htm'), '<h1>网页</h1>');
    await fs.writeFile(path.join(directory, '无文档', '图片.svg'), '<svg/>');
    await fs.symlink(directory, path.join(directory, '循环目录'), process.platform === 'win32' ? 'junction' : 'dir');
    const tree = await scanWorkspace(directory);
    assert.deepEqual(tree.nodes.map((node) => node.name), ['章节', '入口.md']);
    assert.deepEqual(new Set(tree.nodes[0].children[0].children.map((node) => node.name)), new Set(['正文.MARKDOWN', '网页.htm']));
    assert.equal(tree.nodes[0].children[1].name, '页面.HTML');
    assert.equal(isWithin(directory, path.join(directory, '章节', '正文.md')), true);
    assert.equal(isWithin(directory, `${directory}-outside/正文.md`), false);
    assert.equal(isWithin(directory, path.resolve(directory, '..', '正文.md')), false);
    assert.equal(isWithin(directory, directory), false);
    await assert.rejects(scanWorkspace(path.join(directory, 'missing')), /ENOENT/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
