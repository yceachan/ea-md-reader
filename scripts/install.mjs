import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlatformArgs, selectPlatform } from './platforms.mjs';
import { ensureBuild, ensurePackage } from './artifacts.mjs';

async function main() {
  const { platform: requested, rest } = parsePlatformArgs(process.argv.slice(2));
  const uninstall = rest.includes('--uninstall');
  const sources = rest.filter((arg) => arg !== '--uninstall');
  if (sources.length > 1 || sources.some((arg) => arg.startsWith('-')) || (uninstall && sources.length)) {
    throw new Error('用法：node scripts/install.mjs [--platform=kde|gnome|mac|windows] [产物目录 | --uninstall]');
  }
  const platform = selectPlatform(requested);
  const adapter = await platform.load();
  if (!uninstall) {
    if (!sources.length) await ensurePackage(platform.id);
    else if (platform.os === 'linux') await ensureBuild(['icons']);
  }
  const context = {
    root: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    home: homedir(),
    source: sources[0] ? resolve(sources[0]) : undefined,
  };
  console.log(`${uninstall ? '卸载' : '安装'}平台：${platform.name}`);
  await adapter[uninstall ? 'uninstall' : 'install'](context);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
