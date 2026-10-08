import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icons = ['assets/emd.png', ...[16, 24, 32, 48, 64, 128, 256, 512].map(size => `assets/icons/${size}.png`)];

export async function requireBuild(groups = ['renderer', 'icons', 'native'], directory = root) {
  const files = {
    renderer: ['dist/index.html'],
    icons,
    native: process.platform === 'linux' ? ['native-build/emd-application-chooser', 'native-build/emd-kde-startup'] : [],
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

export async function requirePackage() {
  const executable = {
    linux: 'release/linux-unpacked/emd',
    darwin: `release/${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/emd.app/Contents/MacOS/emd`,
    win32: 'release/win-unpacked/emd.exe',
  }[process.platform];
  if (!executable) throw new Error('当前平台的打包验证为 TODO。');
  try { await access(join(root, executable)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`缺少 ${executable}；请先运行 npm run pack。`);
  }
}
