const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { validateExecutable } = require('./editor.cjs');
const execute = promisify(execFile);

function applicationHelper() {
  return process.resourcesPath && !process.defaultApp
    ? path.join(process.resourcesPath, 'emd-application-chooser.exe')
    : path.join(__dirname, '..', '..', 'native-build', 'emd-application-chooser.exe');
}
async function chooseEditor(kind, owner) {
  if (!['markdown', 'html'].includes(kind)) throw new Error('无效的编辑器类型。');
  const handle = owner.getNativeWindowHandle();
  const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString();
  const pending = execute(applicationHelper(), ['choose', kind === 'markdown' ? '.md' : '.html', hwnd], { windowsHide: true });
  const cancel = () => pending.child.kill();
  owner.once('closed', cancel);
  try {
    const { stdout } = await pending;
    const result = JSON.parse(stdout);
    return result.canceled ? null : await validateExecutable(result.program);
  } catch (error) { throw new Error(error.stderr?.trim() || error.message); }
  finally { owner.removeListener('closed', cancel); }
}
module.exports = { chooseEditor, applicationHelper };
