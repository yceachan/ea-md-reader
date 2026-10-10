const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { setTimeout: delay } = require('node:timers/promises');
const { editorSessions } = require('../electron/editor-sessions.cjs');
const { readDocument, publicDocument } = require('../electron/files.cjs');
const { startExecutable } = require('../electron/platforms/editor.cjs');
const { existsSync } = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

test('Linux desktop 应用无需执行位，系统启动保留 Exec 参数与完整文件路径', { skip: process.platform !== 'linux' }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-desktop-editor-')));
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const { validateEditor, startEditor } = require('../electron/platforms/linux-editor.cjs');
    const desktop = path.join(root, 'Typora.desktop'), script = path.join(root, 'editor.cjs');
    const output = path.join(root, 'argv.json'), file = path.join(root, '中文 空格 $()&.md');
    await fs.writeFile(file, '# 正文');
    await fs.writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify(process.argv.slice(2)));`);
    await fs.writeFile(desktop, `[Desktop Entry]\nType=Application\nName=Controlled editor\nExec="${process.execPath}" "${script}" --fixed-argument %F\nTerminal=false\n`, { mode: 0o644 });
    assert.equal((await fs.stat(desktop)).mode & 0o111, 0);
    assert.equal(await validateEditor(desktop), desktop);
    const session = await startEditor({ program: desktop }, file);
    assert.equal(session.waitForFile, false);
    assert.equal(session.completion, null);
    await until(() => existsSync(output));
    assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), ['--fixed-argument', file]);
    await fs.writeFile(desktop, '[Desktop Entry]\nType=Link\nURL=https://example.com\n');
    await assert.rejects(validateEditor(desktop), /不可用/);
  } finally { clearInterval(keepAlive); await fs.rm(root, { recursive: true, force: true }); }
});

async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('未收到预期编辑更新'); await delay(15); }
}

test('直接打开的文件监听覆盖原子替换和后续保存，同路径标签共同更新而其他文件不变', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-editor-watch-')));
  let sessions;
  try {
    const file = path.join(root, '正文.md'), other = path.join(root, '其他.md');
    await fs.writeFile(file, '# 初始'); await fs.writeFile(other, '# 其他');
    const original = await readDocument(file), unrelated = await readDocument(other);
    const documents = new Map([[original.id, original], ['copy', { ...original, id: 'copy' }], [unrelated.id, unrelated]]);
    const changes = [], errors = [];
    sessions = editorSessions({ documents, changed: (document) => changes.push(document), onError: (error) => errors.push(error) });
    sessions.watch(file);
    await fs.writeFile(`${file}.tmp`, '\ufeff# 原子保存\r\n'); await fs.rename(`${file}.tmp`, file);
    await until(() => documents.get(original.id).text.includes('原子保存') && documents.get('copy').text.includes('原子保存'));
    await fs.writeFile(file, '# 第二次保存');
    await until(() => documents.get(original.id).text.includes('第二次保存'));
    assert.equal(documents.get(unrelated.id), unrelated);
    assert.equal(documents.size, 3);
    assert.deepEqual(documents.get('copy').bytes, await fs.readFile(file));
    assert.ok(changes.some((document) => document.id === 'copy'));
    assert.deepEqual(errors, []);
  } finally { sessions?.dispose(); await fs.rm(root, { recursive: true, force: true }); }
});

test('可等待会话结束时重读遗漏变化，HTML 版本更新，关闭标签后不复活', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-editor-end-')));
  let sessions;
  try {
    const file = path.join(root, '页面.html');
    await fs.writeFile(file, '<h1>初始</h1>');
    const original = await readDocument(file), oldUrl = publicDocument(original).pageUrl;
    const documents = new Map([[original.id, original]]), changes = [], errors = [];
    sessions = editorSessions({ documents, changed: (document) => changes.push(publicDocument(document)), onError: (error) => errors.push(error) });
    await fs.writeFile(file, '<h1>关闭前的保存</h1>');
    let finish;
    const completion = new Promise((resolve) => { finish = resolve; });
    await sessions.open(file, async () => ({ completion, waitForFile: true }));
    assert.equal(documents.get(original.id).text, '<h1>初始</h1>');
    finish();
    await until(() => changes.length === 1);
    assert.equal(changes[0].id, original.id);
    assert.notEqual(changes[0].pageUrl, oldUrl);
    let closeFile;
    await sessions.open(file, async () => ({ completion: new Promise((resolve) => { closeFile = resolve; }), waitForFile: true }));
    documents.delete(original.id); sessions.releaseUnused();
    await fs.writeFile(file, '<h1>已关闭标签</h1>'); closeFile();
    await sessions.refresh();
    assert.equal(documents.size, 0);
    assert.equal(changes.length, 1);
    assert.deepEqual(errors, []);
  } finally { sessions?.dispose(); await fs.rm(root, { recursive: true, force: true }); }
});

test('无等待能力不把启动器退出当作关闭；读取失败保留最后快照并报告错误', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-editor-error-')));
  let sessions;
  try {
    const file = path.join(root, '正文.md'); await fs.writeFile(file, '# 原始');
    const original = await readDocument(file), documents = new Map([[original.id, original]]), errors = [];
    sessions = editorSessions({ documents, changed() {}, onError: (error) => errors.push(error) });
    await fs.writeFile(file, '# 已保存');
    await sessions.open(file, async () => ({ completion: Promise.resolve(), waitForFile: false }));
    await delay(30);
    assert.equal(documents.get(original.id).text, '# 原始');
    await sessions.refresh();
    assert.equal(documents.get(original.id).text, '# 已保存');
    const snapshot = documents.get(original.id);
    await fs.writeFile(file, Buffer.from([0xff])); await sessions.refresh();
    assert.equal(documents.get(original.id), snapshot);
    assert.ok(errors.length > 0);
    await fs.rm(file); await sessions.refresh();
    assert.ok(errors.some((error) => error.message.includes('ENOENT')));
  } finally { sessions?.dispose(); await fs.rm(root, { recursive: true, force: true }); }
});

test('原生可执行编辑器获得完整文件参数，退出失败和无法启动均可观察', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-editor-process-')));
  try {
    const name = process.platform === 'win32' ? "中文 空格 '$()&;`%.md" : "中文 空格 ' \" $()&;`%.md";
    const file = path.join(root, name), output = path.join(root, 'argv.json');
    await fs.writeFile(file, `require('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify(process.argv));`);
    const session = await startExecutable({ program: process.execPath }, file);
    assert.equal(session.waitForFile, false);
    await session.completion;
    assert.equal(JSON.parse(await fs.readFile(output, 'utf8'))[1], file);
    await fs.writeFile(file, 'process.exit(7)');
    const failed = await startExecutable({ program: process.execPath }, file);
    await assert.rejects(failed.completion, /7/);
    await assert.rejects(startExecutable({ program: path.join(root, 'missing.exe') }, file), /ENOENT/);
    const cliOutput = path.join(root, 'cli-argv.json'), release = path.join(root, 'close-file');
    const cliScript = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(cliOutput)},JSON.stringify({args:process.argv.slice(2),runAsNode:process.env.ELECTRON_RUN_AS_NODE}));const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer);process.exit(0)}},20);`;
    let code;
    if (process.platform === 'win32') {
      code = path.join(root, 'Code.exe'); await fs.copyFile(process.execPath, code);
      const cli = path.join(root, 'resources', 'app', 'out', 'cli.js'); await fs.mkdir(path.dirname(cli), { recursive: true }); await fs.writeFile(cli, cliScript);
    } else {
      code = path.join(root, 'code'); await fs.writeFile(code, `#!${process.execPath}\n${cliScript}\n`, { mode: 0o755 });
    }
    const waiting = await startExecutable({ program: code }, file);
    let finished = false; waiting.completion.then(() => { finished = true; });
    await until(() => existsSync(cliOutput));
    const argumentsReceived = JSON.parse(await fs.readFile(cliOutput, 'utf8'));
    assert.deepEqual(argumentsReceived.args, ['--wait', file]);
    if (process.platform === 'win32') assert.equal(argumentsReceived.runAsNode, '1');
    assert.equal(waiting.waitForFile, true); assert.equal(finished, false);
    await fs.writeFile(release, 'closed'); await waiting.completion;
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('外部编辑器仍运行时保持父进程引用，结束后父进程自然退出', { timeout: 10000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-editor-reference-')));
  const ready = path.join(root, 'ready'), release = path.join(root, 'release'), finished = path.join(root, 'finished');
  let parent;
  try {
    const editor = path.join(root, 'editor.cjs');
    await fs.writeFile(editor, `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(ready)},'ready');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer);fs.writeFileSync(${JSON.stringify(finished)},'finished')}},20);`);
    const modulePath = require.resolve('../electron/platforms/editor.cjs');
    const script = `require(${JSON.stringify(modulePath)}).startProcess(process.execPath,[${JSON.stringify(editor)}],false).then(session=>session.completion).catch(error=>{console.error(error);process.exitCode=1});`;
    parent = execute(process.execPath, ['-e', script], { windowsHide: true, timeout: 5000 });
    // Attach the rejection handler immediately; cleanup still awaits the original result.
    parent.catch(() => {});
    await until(() => existsSync(ready));
    assert.equal(parent.child.exitCode, null, '父进程不应在编辑器仍运行时自然退出');
    await fs.writeFile(release, 'release');
    await parent;
    assert.equal(await fs.readFile(finished, 'utf8'), 'finished');
    assert.equal(parent.child.exitCode, 0);
  } finally {
    await fs.writeFile(release, 'release');
    if (existsSync(ready)) await until(() => existsSync(finished));
    if (parent) await parent.catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
});
