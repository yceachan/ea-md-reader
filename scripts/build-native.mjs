import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform === 'linux') {
  execFileSync('cmake', ['-S', 'native', '-B', 'native-build', '-DCMAKE_BUILD_TYPE=Release'], { cwd: root, stdio: 'inherit' });
  execFileSync('cmake', ['--build', 'native-build', '--parallel', '2'], { cwd: root, stdio: 'inherit' });
} else if (process.platform === 'win32') {
  mkdirSync(resolve(root, 'native-build'), { recursive: true });
  const compiler = resolve(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  execFileSync(compiler, ['/nologo', '/target:exe', '/platform:anycpu', '/codepage:65001',
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
    `/out:${resolve(root, 'native-build/emd-application-chooser.exe')}`, resolve(root, 'native/windows-application-chooser.cs')], { cwd: root, stdio: 'inherit', windowsHide: true });
} else console.log('当前平台没有原生辅助程序编译目标。');
