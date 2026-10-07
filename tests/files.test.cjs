const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readDocument, publicDocument, saveDocument, fileArguments, scanWorkspace, isWithin } = require('../electron/files.cjs');

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
