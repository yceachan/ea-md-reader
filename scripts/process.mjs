import { spawn } from 'node:child_process';
import { constants } from 'node:os';

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    function cleanup() {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
    }
    child.once('error', error => { cleanup(); reject(new Error(`无法启动 ${command}：${error.message}`, { cause: error })); });
    child.once('close', (code, signal) => { cleanup(); resolve(code ?? 128 + constants.signals[signal]); });
  });
}
