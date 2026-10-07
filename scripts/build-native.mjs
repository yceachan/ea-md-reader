import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'linux') {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  execFileSync('cmake', ['-S', 'native', '-B', 'native-build', '-DCMAKE_BUILD_TYPE=Release'], { cwd: root, stdio: 'inherit' });
  execFileSync('cmake', ['--build', 'native-build', '--parallel', '2'], { cwd: root, stdio: 'inherit' });
}
