const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { validateExecutable, startExecutable, startProcess } = require('./editor.cjs');
const execute = promisify(execFile);

function applicationHelper() {
  return process.resourcesPath && !process.defaultApp ? path.join(process.resourcesPath, 'emd-application-chooser') : path.join(__dirname, '..', '..', 'native-build', 'emd-application-chooser');
}
async function applicationDescription(action, value, owner) {
  const pending = execute(applicationHelper(), [action, value]);
  const cancel = () => pending.child.kill();
  owner?.once('closed', cancel);
  try {
    const { stdout } = await pending;
    return JSON.parse(stdout);
  } catch (error) { throw new Error(error.stderr?.trim() || error.message); }
  finally { owner?.removeListener('closed', cancel); }
}
async function chooseEditor(kind, owner) {
  const result = await applicationDescription('choose', kind === 'markdown' ? 'text/markdown' : 'text/html', owner);
  return result.canceled ? null : result.program;
}
async function validateEditor(program) {
  if (!program.endsWith('.desktop')) return validateExecutable(program);
  return (await applicationDescription('inspect', program)).program;
}
async function startEditor(editor, filePath) {
  if (!editor.program.endsWith('.desktop')) return startExecutable(editor, filePath);
  const application = await applicationDescription('inspect', editor.program);
  if (path.basename(application.program) === 'code.desktop') {
    const executable = await validateExecutable(application.executable);
    if (path.basename(path.dirname(executable)) === 'bin') return startExecutable({ program: executable }, filePath);
    const cli = path.join(path.dirname(executable), 'resources', 'app', 'out', 'cli.js');
    await fs.access(cli);
    return startProcess(executable, [cli, '--wait', filePath], true, { ...process.env, ELECTRON_RUN_AS_NODE: '1' });
  }
  const session = await startProcess('gio', ['launch', application.program, filePath], false);
  await session.completion;
  return { completion: null, waitForFile: false };
}
module.exports = { chooseEditor, validateEditor, startEditor };
