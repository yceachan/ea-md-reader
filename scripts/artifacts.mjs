import { access, lstat, mkdir, readFile, readdir, readlink, rename, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { run } from './process.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icons = ['assets/emd.png', ...[16, 24, 32, 48, 64, 128, 256, 512].map(size => `assets/icons/${size}.png`)];

export async function requireBuild(groups = ['renderer', 'icons', 'native'], directory = root) {
  const files = {
    renderer: ['dist/index.html', 'dist/profile.json'],
    icons,
    native: process.platform === 'linux' ? ['native-build/emd-application-chooser', 'native-build/emd-kde-startup'] : process.platform === 'win32' ? ['native-build/emd-application-chooser.exe'] : [],
  };
  for (const group of groups) {
    for (const file of files[group]) {
      try { await access(join(directory, file)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        throw new Error(`缺少 ${file}；请先运行 npm run build:${group}。`);
      }
    }
  }
}

function packageDirectory() {
  return { linux: 'release/linux-unpacked', darwin: `release/${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/emd.app`, win32: 'release/win-unpacked' }[process.platform];
}

export async function requirePackage(directory = root) {
  const executable = {
    linux: 'release/linux-unpacked/emd',
    darwin: `release/${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/emd.app/Contents/MacOS/emd`,
    win32: 'release/win-unpacked/emd.exe',
  }[process.platform];
  if (!executable) throw new Error('当前平台的打包验证为 TODO。');
  try { await access(join(directory, executable)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`缺少 ${executable}；请先运行 npm run pack。`);
  }
}


const buildGroups = ['icons', 'native', 'renderer'];
async function dependencyInputs(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
  const files = ['node_modules/.package-lock.json'];
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).sort()) {
    const file = `node_modules/${name}/package.json`;
    const installed = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const expected = lock.packages[`node_modules/${name}`].version;
    if (installed.version !== expected) throw new Error(`${name} 已安装 ${installed.version}，锁文件要求 ${expected}；请先运行 npm ci。`);
    files.push(file);
  }
  return files;
}
async function groupInputs(group, directory) {
  const common = ['package.json', 'package-lock.json', 'scripts/build.mjs', 'scripts/artifacts.mjs', 'scripts/process.mjs'];
  const inputs = {
    icons: ['assets/emd.svg', 'scripts/render-icons.mjs'],
    native: ['native', 'scripts/build-native.mjs'],
    renderer: ['src', 'public', 'assets/emd.svg', 'index.html', 'vite.config.ts', 'tsconfig.json', 'setting.toml', 'electron/profile.cjs', 'electron/files.cjs'],
  };
  if (!Object.hasOwn(inputs, group)) throw new Error(`无效的构建组件：${group}`);
  return [...common, ...await dependencyInputs(directory), ...inputs[group]];
}
function groupOutputs(group) {
  return {
    icons,
    renderer: ['dist'],
    native: process.platform === 'linux' ? ['native-build/emd-application-chooser', 'native-build/emd-kde-startup'] : process.platform === 'win32' ? ['native-build/emd-application-chooser.exe'] : [],
  }[group];
}

// Content hashes cover additions, deletions and restored timestamps. Do not walk
// package symlinks: framework targets are hashed at their actual directory entry.
async function fingerprint(paths, directory) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version }));
  async function visit(relative) {
    const file = join(directory, relative);
    const info = await lstat(file);
    hash.update(JSON.stringify(relative));
    if (info.isSymbolicLink()) hash.update(JSON.stringify(['link', await readlink(file)]));
    else if (info.isDirectory()) {
      hash.update('directory');
      for (const name of (await readdir(file)).sort()) await visit(`${relative}/${name}`);
    } else if (info.isFile()) {
      hash.update(`file:${info.size}:`);
      for await (const chunk of createReadStream(file)) hash.update(chunk);
    } else throw new Error(`构建路径不是普通文件或目录：${file}`);
  }
  for (const relative of paths) await visit(relative);
  return hash.digest('hex');
}
function receiptPath(kind, directory) { return join(directory, '.dev/build-state', `${kind}.json`); }
async function current(kind, input, outputs, directory) {
  let text;
  try { text = await readFile(receiptPath(kind, directory), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  const receipt = JSON.parse(text);
  if (receipt.input !== input) return false;
  try { return receipt.output === await fingerprint(outputs, directory); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function record(kind, input, outputs, directory) {
  const file = receiptPath(kind, directory);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ input, output: await fingerprint(outputs, directory) }) + '\n', { flag: 'wx' });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

export async function buildGroup(group, directory = root) {
  const inputs = await groupInputs(group, directory);
  const input = await fingerprint(inputs, directory);
  const scripts = { icons: 'scripts/render-icons.mjs', native: 'scripts/build-native.mjs', renderer: 'node_modules/vite/bin/vite.js' };
  const code = await run(process.execPath, [join(directory, scripts[group]), ...(group === 'renderer' ? ['build'] : [])], { cwd: directory });
  if (code !== 0) throw new Error(`${group} 构建失败（退出码 ${code}）。`);
  await requireBuild([group], directory);
  if (input !== await fingerprint(inputs, directory)) throw new Error(`${group} 源码在构建期间发生变化，请重新执行。`);
  await record(group, input, groupOutputs(group), directory);
}

export async function ensureBuild(groups = buildGroups, directory = root) {
  for (const group of groups) {
    const inputs = await groupInputs(group, directory);
    if (group === 'native' && !groupOutputs(group).length) continue;
    if (await current(group, await fingerprint(inputs, directory), groupOutputs(group), directory)) console.log(`复用最新构建：${group}`);
    else { console.log(`更新构建：${group}`); await buildGroup(group, directory); }
  }
}

export async function packageFingerprint(directory = root) {
  return fingerprint(['dist', 'electron', ...icons, 'assets/emd.svg', 'assets/emd.desktop', ...groupOutputs('native'), 'LICENSE', 'package.json', 'package-lock.json', ...await dependencyInputs(directory), 'scripts/pack.mjs', 'scripts/artifacts.mjs', 'scripts/platforms.mjs', 'scripts/platforms'], directory);
}
async function packageOutputs(distribution, directory) {
  const output = packageDirectory();
  if (!output) throw new Error('当前平台的打包为 TODO。');
  if (!distribution) return [output];
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const extensions = { linux: ['tar.gz'], darwin: ['dmg', 'zip'], win32: ['exe', 'zip'] }[process.platform];
  const os = { linux: 'linux', darwin: 'mac', win32: 'win' }[process.platform];
  return [output, ...extensions.map(ext => `release/${manifest.build.artifactName.replaceAll('${version}', manifest.version).replaceAll('${os}', os).replaceAll('${arch}', process.arch).replaceAll('${ext}', ext)}`)];
}
export async function packageCurrent(distribution = false, directory = root) {
  return current(distribution ? 'distribution' : 'package', await packageFingerprint(directory), await packageOutputs(distribution, directory), directory);
}
export async function recordPackage(input, distribution = false, directory = root) {
  await requirePackage(directory);
  if (input !== await packageFingerprint(directory)) throw new Error('打包输入在执行期间发生变化，请重新执行。');
  await record('package', input, await packageOutputs(false, directory), directory);
  if (distribution) await record('distribution', input, await packageOutputs(true, directory), directory);
}
export async function ensurePackage(platform, directory = root) {
  const code = await run(process.execPath, [join(directory, 'scripts/pack.mjs'), `--platform=${platform}`], { cwd: directory });
  if (code !== 0) throw new Error(`准备应用包失败（退出码 ${code}）。`);
  await requirePackage(directory);
}
