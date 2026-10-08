import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const packOptions = {
  win: ['dir', 'nsis', 'zip'],
  config: {
    win: { icon: 'assets/emd.png' },
    nsis: {
      oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
      include: 'scripts/platforms/windows-associations.nsh',
      runAfterFinish: false, createDesktopShortcut: false,
    },
  },
};

const appId = 'io.github.yceachan.emd';
const markerName = '.ea-md-reader-install.json';
const marker = `${JSON.stringify({ appId, installer: 'ea-md-reader' }, null, 2)}\n`;

function locations(home, env) {
  const localAppData = env.LOCALAPPDATA || join(home, 'AppData', 'Local');
  const appData = env.APPDATA || join(home, 'AppData', 'Roaming');
  const target = join(localAppData, 'Programs', 'emd');
  return {
    programs: dirname(target), target, executable: join(target, 'emd.exe'),
    shortcut: join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'emd.lnk'),
  };
}

async function exists(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function checkPackage(directory) {
  const packageInfo = await lstat(directory);
  if (!packageInfo.isDirectory() || packageInfo.isSymbolicLink()) throw new Error(`应用产物必须是实际目录：${directory}`);
  const executable = join(directory, 'emd.exe');
  const executableInfo = await lstat(executable);
  if (!executableInfo.isFile() || executableInfo.isSymbolicLink()) throw new Error(`应用缺少可执行文件：${executable}`);
  return executable;
}

async function checkOwnedTarget(target) {
  const targetInfo = await exists(target);
  if (!targetInfo) return false;
  await checkPackage(target);
  let contents;
  try { contents = await readFile(join(target, markerName), 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`拒绝覆盖或删除其他应用：${target}`);
    throw error;
  }
  if (contents !== marker) throw new Error(`拒绝覆盖或删除其他应用：${target}`);
  return true;
}

function integrate({ root, executable, shortcut, env, run }, action) {
  run('pwsh.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'scripts', 'platforms', 'windows-integration.ps1'),
    action, executable, shortcut,
  ], { stdio: 'pipe', windowsHide: true });
}

export async function install({ root, home, source = join(root, 'release', 'win-unpacked'), env = process.env, run = execFileSync }) {
  const paths = locations(home, env);
  const packageDirectory = resolve(source);
  await checkPackage(packageDirectory);
  const hasOldTarget = await checkOwnedTarget(paths.target);
  if (hasOldTarget && await realpath(packageDirectory) === await realpath(paths.target)) throw new Error('源应用已经在安装位置，无需复制。');

  await mkdir(paths.programs, { recursive: true });
  await mkdir(dirname(paths.shortcut), { recursive: true });
  integrate({ root, ...paths, env, run }, 'validate');
  const staging = await mkdtemp(join(paths.programs, '.emd-install-'));
  const stagedApp = join(staging, 'emd');
  const oldApp = join(staging, 'previous');
  let movedOld = false, installedNew = false, preserveRecovery = false;
  try {
    await cp(packageDirectory, stagedApp, { recursive: true });
    await checkPackage(stagedApp);
    await writeFile(join(stagedApp, markerName), marker, { flag: 'wx' });
    try {
      if (hasOldTarget) { await rename(paths.target, oldApp); movedOld = true; }
      await rename(stagedApp, paths.target); installedNew = true;
      integrate({ root, ...paths, env, run }, 'install');
    } catch (error) {
      const rollbackErrors = [];
      // PowerShell restores its registry and shortcut snapshot before reporting a failure.
      try {
        if (installedNew) await rm(paths.target, { recursive: true, force: true });
        if (movedOld) { await rename(oldApp, paths.target); movedOld = false; }
      } catch (rollbackError) {
        preserveRecovery = movedOld;
        rollbackErrors.push(rollbackError);
      }
      if (rollbackErrors.length) {
        const recovery = preserveRecovery ? `旧应用保留在 ${oldApp}，请手动恢复。` : `请检查安装位置：${paths.target}。`;
        throw new AggregateError([error, ...rollbackErrors], `安装失败：${error.message}；恢复失败：${rollbackErrors.map((item) => item.message).join('；')}；${recovery}`);
      }
      throw error;
    }
    console.log(`已安装用户级 emd：${paths.executable}\n开始菜单入口：${paths.shortcut}`);
    console.log('已注册 Markdown / HTML 打开方式，不修改默认应用。');
  } finally {
    if (!preserveRecovery) await rm(staging, { recursive: true, force: true });
  }
}

export async function uninstall({ root, home, env = process.env, run = execFileSync }) {
  const paths = locations(home, env);
  const present = await checkOwnedTarget(paths.target);
  integrate({ root, ...paths, env, run }, 'uninstall');
  if (present) await rm(paths.target, { recursive: true, force: true });
  console.log('已移除用户级 emd 应用、开始菜单入口和文件关联；配置与源文档保留。');
}
