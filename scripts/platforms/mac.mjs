import { chmod, cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const packOptions = {
  mac: ['dir', 'dmg', 'zip'],
  config: {
    mac: {
      category: 'public.app-category.productivity',
      icon: 'assets/emd.svg',
      // Local builds use an ad-hoc signature. Distribution signing is configured separately.
      identity: '-', hardenedRuntime: false, notarize: false,
      fileAssociations: [{
        ext: ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx'],
        name: 'Markdown document', role: 'Viewer', rank: 'Alternate',
      }, {
        ext: ['html', 'htm'], name: 'HTML document', role: 'Viewer', rank: 'Alternate',
      }],
    },
  },
};

const appId = 'io.github.yceachan.emd';
const appName = 'emd.app';
const launcherHeader = '#!/bin/sh\n# ea-md-reader macOS launcher\n';
const launchServices = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function locations(home) {
  return {
    applications: join(home, 'Applications'), target: join(home, 'Applications', appName),
    bin: join(home, '.local', 'bin'), launcher: join(home, '.local', 'bin', 'emd'),
    logs: join(home, 'Library', 'Logs', 'emd'),
  };
}

async function exists(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function checkBundle(bundle, run) {
  const info = await lstat(bundle);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`应用包必须是实际目录：${bundle}`);
  const plist = join(bundle, 'Contents', 'Info.plist');
  const identifier = String(run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist], { encoding: 'utf8' })).trim();
  if (identifier !== appId) throw new Error(`拒绝操作其他应用：${bundle}`);
  const executable = join(bundle, 'Contents', 'MacOS', 'emd');
  const binary = await lstat(executable);
  if (!binary.isFile() || binary.isSymbolicLink() || !(binary.mode & 0o111)) throw new Error(`应用缺少可执行文件：${executable}`);
  return executable;
}

async function checkLauncher(launcher) {
  const info = await exists(launcher);
  if (!info) return;
  if (!info.isFile() || info.isSymbolicLink() || !(await readFile(launcher, 'utf8')).startsWith(launcherHeader)) {
    throw new Error(`拒绝覆盖或删除现有命令：${launcher}`);
  }
}

function refreshRegistration(target, run, uninstall = false) {
  run(launchServices, [uninstall ? '-u' : '-f', target], { stdio: 'pipe' });
}

export async function install({ root, home, source, run = execFileSync }) {
  const { applications, target, bin, launcher, logs } = locations(home);
  const defaultSource = join(root, 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', appName);
  let bundle = resolve(source ?? defaultSource);
  if (!bundle.endsWith('.app')) bundle = join(bundle, appName);
  await checkBundle(bundle, run);
  if (await exists(target)) {
    await checkBundle(target, run);
    if (await realpath(bundle) === await realpath(target)) throw new Error('源应用已经在安装位置，无需复制。');
  }
  await checkLauncher(launcher);
  // Validate both existing destinations before any installation writes.
  await mkdir(applications, { recursive: true });
  await mkdir(bin, { recursive: true });
  await mkdir(logs, { recursive: true });
  const staging = await mkdtemp(join(applications, '.emd-install-'));
  const stagedApp = join(staging, appName), oldApp = join(staging, 'previous.app');
  const stagedLauncher = join(staging, 'emd');
  let movedOld = false, installedNew = false, registrationAttempted = false, preserveRecovery = false;
  const launcherTemp = join(bin, `.emd-install-${basename(staging)}`);
  try {
    // ditto preserves Framework symlinks, signing metadata and quarantine attributes.
    run('/usr/bin/ditto', [bundle, stagedApp], { stdio: 'pipe' });
    await checkBundle(stagedApp, run);
    const script = `${launcherHeader}set -eu\nmkdir -p ${quote(logs)}\nnohup ${quote(join(target, 'Contents', 'MacOS', 'emd'))} "$@" </dev/null >>${quote(join(logs, 'emd.log'))} 2>&1 &\n`;
    await writeFile(stagedLauncher, script, { mode: 0o755 });
    await chmod(stagedLauncher, 0o755);
    // Renames are on the same filesystem as their respective final destinations.
    await cp(stagedLauncher, launcherTemp);
    try {
      if (await exists(target)) { await rename(target, oldApp); movedOld = true; }
      await rename(stagedApp, target); installedNew = true;
      registrationAttempted = true;
      refreshRegistration(target, run);
      await rename(launcherTemp, launcher);
    } catch (error) {
      const rollbackErrors = [];
      let restoredOld = false;
      // Unregister while the new bundle is present, even if registration reported a failure.
      if (registrationAttempted) {
        try { refreshRegistration(target, run, true); }
        catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      try {
        if (installedNew) await rm(target, { recursive: true, force: true });
        if (movedOld) { await rename(oldApp, target); movedOld = false; restoredOld = true; }
      } catch (rollbackError) {
        preserveRecovery = movedOld;
        rollbackErrors.push(rollbackError);
      }
      if (restoredOld && registrationAttempted) {
        try { refreshRegistration(target, run); }
        catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      if (rollbackErrors.length) {
        const recovery = preserveRecovery
          ? `旧应用保留在 ${oldApp}，请手动恢复。`
          : `恢复未完成，请检查应用和 LaunchServices 注册：${target}。`;
        throw new AggregateError([error, ...rollbackErrors], `安装失败：${error.message}；恢复失败：${rollbackErrors.map((item) => item.message).join('；')}；${recovery}`);
      }
      throw error;
    } finally { await rm(launcherTemp, { force: true }); }
    console.log(`已安装用户级 emd：${target}\n终端命令：${launcher}\n日志：${join(logs, 'emd.log')}`);
    console.log('请将 ~/.local/bin 加入 PATH；Finder 打开方式已注册，默认应用设置保留。');
  } finally {
    // An old bundle is only removed after successful replacement or rollback.
    await rm(launcherTemp, { force: true });
    if (!preserveRecovery) await rm(staging, { recursive: true, force: true });
  }
}

export async function uninstall({ home, run = execFileSync }) {
  const { target, launcher } = locations(home);
  const present = await exists(target);
  if (present) await checkBundle(target, run);
  await checkLauncher(launcher);
  if (present) refreshRegistration(target, run, true);
  await rm(target, { recursive: true, force: true });
  await rm(launcher, { force: true });
  console.log('已移除用户级 emd 应用和命令；配置、日志和源文档保留。');
}
