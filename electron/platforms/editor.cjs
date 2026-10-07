const fs = require('node:fs/promises');

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

module.exports = { validateExecutable, validateMacEditor };
