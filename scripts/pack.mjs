import { parsePlatformArgs, selectPlatform } from './platforms.mjs';
import { root, ensureBuild, packageCurrent, packageFingerprint, recordPackage } from './artifacts.mjs';

async function main() {
  const { platform: requested, rest } = parsePlatformArgs(process.argv.slice(2));
  const distribution = rest.length === 1 && rest[0] === '--dist';
  if (rest.length && !distribution) throw new Error('用法：npm run pack 或 npm run dist -- [--platform=kde|gnome|mac|windows]');
  const platform = selectPlatform(requested);
  const adapter = await platform.load();
  await ensureBuild();
  if (await packageCurrent(distribution)) {
    console.log(`复用最新${distribution ? '发行档案' : '应用目录'}：${platform.name}`);
    return;
  }
  console.log(`${distribution ? '发行档案' : '应用目录'}平台：${platform.name}`);
  const input = await packageFingerprint();
  const options = { ...adapter.packOptions };
  if (!distribution) options[{ linux: 'linux', darwin: 'mac', win32: 'win' }[platform.os]] = ['dir'];
  const { build } = await import('electron-builder');
  await build({ projectDir: root, ...options, publish: 'never' });
  await recordPackage(input, distribution);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
