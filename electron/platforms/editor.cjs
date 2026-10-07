const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function validateExecutable(program) {
  const canonical = await fs.realpath(program);
  if (!(await fs.stat(canonical)).isFile()) throw new Error('请选择编辑器可执行程序。');
  await fs.access(canonical, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
  if (process.platform === 'win32' && !/\.exe$/i.test(canonical)) throw new Error('请选择编辑器 .exe 程序。');
  return canonical;
}

async function validateMacEditor(program) {
  const canonical = await fs.realpath(program);
  if (/\.app$/i.test(canonical) && (await fs.stat(canonical)).isDirectory()) {
    await fs.access(`${canonical}/Contents/Info.plist`);
    return canonical;
  }
  return validateExecutable(canonical);
}

function startProcess(program, args, waitForFile, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { shell: false, detached: true, windowsHide: true, stdio: 'ignore', env });
    let started = false, finish, fail;
    const completion = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    child.once('error', (error) => { if (started) fail(error); else reject(error); });
    child.once('spawn', () => { started = true; child.unref(); resolve({ completion, waitForFile }); });
    child.once('exit', (code, signal) => {
      if (code === 0) finish();
      else fail(new Error(`编辑器进程失败：${signal ?? code}（${program}）`));
    });
  });
}

async function startExecutable(editor, filePath) {
  const program = await validateExecutable(editor.program);
  const name = path.basename(program).toLowerCase();
  if (process.platform === 'win32' && name === 'code.exe') {
    const cli = path.join(path.dirname(program), 'resources', 'app', 'out', 'cli.js');
    await fs.access(cli);
    return startProcess(program, [cli, '--wait', filePath], true, { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
  }
  const waitForFile = name === 'code';
  return startProcess(program, waitForFile ? ['--wait', filePath] : [filePath], waitForFile);
}

async function startMacEditor(editor, filePath) {
  const program = await validateMacEditor(editor.program);
  if (!/\.app$/i.test(program)) return startExecutable({ program }, filePath);
  if (path.basename(program) === 'Visual Studio Code.app') return startExecutable({ program: path.join(program, 'Contents', 'Resources', 'app', 'bin', 'code') }, filePath);
  const session = await startProcess('/usr/bin/open', ['-a', program, filePath], false);
  await session.completion;
  return { completion: null, waitForFile: false };
}

module.exports = { validateExecutable, validateMacEditor, startExecutable, startMacEditor };
