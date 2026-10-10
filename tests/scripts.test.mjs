import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, rm, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, requireBuild, ensureBuild } from '../scripts/artifacts.mjs';

test('缺失构建按组件报告准备命令，已有产物可直接复用', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'emd-artifacts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(requireBuild(['renderer'], directory), /dist\/index.html.*npm run build:renderer/);
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist/index.html'), '<h1>已有构建</h1>');
  await assert.rejects(requireBuild(['renderer'], directory), /dist\/profile.json.*npm run build:renderer/);
  await writeFile(join(directory, 'dist/profile.json'), '{}');
  await requireBuild(['renderer'], directory);
  await assert.rejects(requireBuild(['icons'], directory), /assets\/emd.png.*npm run build:icons/);
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'emd-fresh-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const file of ['scripts', 'src', 'public', 'native', 'electron', 'assets', 'package.json', 'package-lock.json', 'LICENSE', 'index.html', 'vite.config.ts', 'tsconfig.json', 'setting.toml']) {
    // Generated icons are supplied by the controlled build below.
    if (file === 'assets') {
      await mkdir(join(directory, 'assets'));
      for (const name of ['emd.svg', 'emd.desktop']) await cp(join(root, 'assets', name), join(directory, 'assets', name));
    } else await cp(join(root, file), join(directory, file), { recursive: true });
  }
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  manifest.main = 'start-fixture.cjs';
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    await mkdir(join(directory, 'node_modules', name), { recursive: true });
    await writeFile(join(directory, 'node_modules', name, 'package.json'), '{"version":"1.0.0"}');
  }
  await writeFile(join(directory, 'node_modules/.package-lock.json'), '{}');
  await writeFile(join(directory, 'start-fixture.cjs'), "require('node:fs').writeFileSync('started',process.argv.slice(2).join(' '));");
  const shared = `
    function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
    function count(kind) { const file='calls.json'; const calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[]; calls.push(kind); fs.writeFileSync(file,JSON.stringify(calls)); }
  `;
  const esm = "import fs from 'node:fs'; import path from 'node:path';\n" + shared;
  const cjs = "const fs=require('node:fs'),path=require('node:path');\n" + shared;
  await writeFile(join(directory, 'scripts/render-icons.mjs'), esm + `count('icons'); const svg=fs.readFileSync('assets/emd.svg'); for(const size of [16,24,32,48,64,128,256,512]) write('assets/icons/'+size+'.png',svg); write('assets/emd.png',svg);`);
  const nativeOutputs = { linux: ['emd-application-chooser', 'emd-kde-startup'], win32: ['emd-application-chooser.exe'], darwin: [] }[process.platform];
  await writeFile(join(directory, 'scripts/build-native.mjs'), esm + `count('native'); for(const name of ${JSON.stringify(nativeOutputs)}) write('native-build/'+name,fs.readFileSync('native/CMakeLists.txt'));`);
  await mkdir(join(directory, 'node_modules/vite/bin'), { recursive: true });
  await writeFile(join(directory, 'node_modules/vite/bin/vite.js'), cjs + `count('renderer'); if(fs.existsSync('fail-renderer')) process.exit(13); write('dist/index.html',fs.readFileSync('src/App.tsx')); write('dist/profile.json',fs.readFileSync('setting.toml')); write('dist/chunk.js','compiled');`);
  const app = { linux: 'release/linux-unpacked', darwin: 'release/'+(process.arch==='arm64'?'mac-arm64':'mac')+'/emd.app', win32: 'release/win-unpacked' }[process.platform];
  const executable = { linux: 'emd', darwin: 'Contents/MacOS/emd', win32: 'emd.exe' }[process.platform];
  await mkdir(join(directory, 'node_modules/electron-builder'), { recursive: true });
  await writeFile(join(directory, 'node_modules/electron-builder/package.json'), '{"type":"module","exports":"./index.mjs"}');
  await writeFile(join(directory, 'node_modules/electron-builder/index.mjs'), esm + `export async function build(options) {
    count('package'); write(${JSON.stringify(app + '/' + executable)},'executable'); write(${JSON.stringify(app + '/runtime.txt')}, fs.readFileSync('electron/main.cjs'));
    const os={linux:'linux',darwin:'mac',win32:'win'}[process.platform];
    const key={linux:'linux',darwin:'mac',win32:'win'}[process.platform];
    if(options[key].length>1) {
      const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
      for(const ext of {linux:['tar.gz'],darwin:['dmg','zip'],win32:['exe','zip']}[process.platform]) write('release/'+pkg.build.artifactName.replaceAll('$'+'{version}',pkg.version).replaceAll('$'+'{os}',os).replaceAll('$'+'{arch}',process.arch).replaceAll('$'+'{ext}',ext),'archive');
    }
  }`);
  await mkdir(join(directory, 'node_modules/electron'), { recursive: true });
  await writeFile(join(directory, 'node_modules/electron/package.json'), '{"type":"module","exports":"./index.mjs"}');
  await writeFile(join(directory, 'node_modules/electron/index.mjs'), 'export default process.execPath;');
  const platform = { linux: 'kde', darwin: 'mac', win32: 'windows' }[process.platform];
  await writeFile(join(directory, `scripts/platforms/${platform}.mjs`), esm + `export const packOptions={${{linux:'linux',darwin:'mac',win32:'win'}[process.platform]}:['dir','archive']}; export async function install(context){count('install');write('installed-source',context.source??${JSON.stringify(app)});} export async function uninstall(){count('uninstall');}`);
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const file = join(directory, 'node_modules', name, 'package.json');
    const value = JSON.parse(await readFile(file, 'utf8'));
    value.version = lock.packages[`node_modules/${name}`].version;
    await writeFile(file, JSON.stringify(value));
  }
  return { directory, platform, app, nativeOutputs };
}
function cli(directory, script, args = []) {
  return spawnSync(process.execPath, [join(directory, 'scripts', script), ...args], { cwd: directory, encoding: 'utf8' });
}
function successful(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }
async function calls(directory) { return JSON.parse(await readFile(join(directory, 'calls.json'), 'utf8')); }
const initialBuild = () => ['icons', ...(process.platform === 'darwin' ? [] : ['native']), 'renderer'];

test('首次补齐构建，内容与增删文件使对应组件过期，恢复修改时间不能绕过检查', async t => {
  const { directory } = await fixture(t);
  await ensureBuild(undefined, directory);
  assert.deepEqual(await calls(directory), initialBuild());
  await ensureBuild(undefined, directory);
  assert.deepEqual(await calls(directory), initialBuild());
  const source = join(directory, 'src/App.tsx'), original = await stat(source);
  await writeFile(source, '// changed renderer');
  await utimes(source, original.atime, original.mtime);
  await ensureBuild(undefined, directory);
  assert.deepEqual(await calls(directory), [...initialBuild(), 'renderer']);
  await writeFile(join(directory, 'public/new.txt'), 'new asset');
  await ensureBuild(undefined, directory);
  await rm(join(directory, 'public/new.txt'));
  await ensureBuild(undefined, directory);
  await rm(join(directory, 'dist/chunk.js'));
  await ensureBuild(undefined, directory);
  assert.deepEqual(await calls(directory), [...initialBuild(), ...Array(4).fill('renderer')]);
  await writeFile(join(directory, 'assets/emd.svg'), 'new icon');
  await ensureBuild(undefined, directory);
  assert.deepEqual((await calls(directory)).slice(-2), ['icons', 'renderer']);
  const previousCalls = await calls(directory);
  await writeFile(join(directory, 'node_modules/mermaid/package.json'), '{"version":"2.0.0"}');
  await assert.rejects(ensureBuild(undefined, directory), /mermaid.*npm ci/);
  assert.deepEqual(await calls(directory), previousCalls);
});

test('start 自动准备当前构建并传递文件参数，不在测试中启动 Reader', async t => {
  const { directory } = await fixture(t);
  successful(cli(directory, 'start.mjs', ['document.md']));
  assert.deepEqual(await calls(directory), initialBuild());
  assert.equal(await readFile(join(directory, 'started'), 'utf8'), 'document.md');
  successful(cli(directory, 'start.mjs'));
  assert.deepEqual(await calls(directory), initialBuild());
});

test('默认安装自动构建和打包，重复安装复用；运行时代码变化只重新打包', async t => {
  const { directory, platform } = await fixture(t);
  successful(cli(directory, 'install.mjs', [`--platform=${platform}`]));
  assert.deepEqual(await calls(directory), [...initialBuild(), 'package', 'install']);
  successful(cli(directory, 'install.mjs', [`--platform=${platform}`]));
  assert.deepEqual((await calls(directory)).slice(-2), ['install', 'install']);
  await writeFile(join(directory, 'electron/main.cjs'), '// new runtime');
  successful(cli(directory, 'install.mjs', [`--platform=${platform}`]));
  assert.deepEqual(await calls(directory), [...initialBuild(), 'package', 'install', 'install', 'package', 'install']);
  await writeFile(join(directory, 'src/App.tsx'), '// new UI');
  successful(cli(directory, 'install.mjs', [`--platform=${platform}`]));
  assert.deepEqual((await calls(directory)).slice(-3), ['renderer', 'package', 'install']);
  await writeFile(join(directory, 'README.md'), 'documentation only');
  successful(cli(directory, 'pack.mjs', [`--platform=${platform}`]));
  assert.equal((await calls(directory)).at(-1), 'install');
});

test('发行档案可复用，缺失档案或应用内容被改动时重新打包', async t => {
  const { directory, platform, app } = await fixture(t);
  const args = [`--platform=${platform}`, '--dist'];
  successful(cli(directory, 'pack.mjs', args));
  successful(cli(directory, 'pack.mjs', args));
  assert.deepEqual(await calls(directory), [...initialBuild(), 'package']);
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const os = {linux:'linux',darwin:'mac',win32:'win'}[process.platform];
  const ext = {linux:'tar.gz',darwin:'zip',win32:'zip'}[process.platform];
  await rm(join(directory, `release/emd-${manifest.version}-${os}-${process.arch}.${ext}`));
  successful(cli(directory, 'pack.mjs', args));
  assert.equal((await calls(directory)).filter(kind => kind === 'package').length, 2);
  await writeFile(join(directory, app, 'runtime.txt'), 'tampered');
  successful(cli(directory, 'pack.mjs', [`--platform=${platform}`]));
  assert.equal((await calls(directory)).filter(kind => kind === 'package').length, 3);
});

test('外部产物按指定来源安装，卸载不触发构建或打包', async t => {
  const { directory, platform } = await fixture(t);
  const external = join(directory, 'external-app'); await mkdir(external);
  successful(cli(directory, 'install.mjs', [`--platform=${platform}`, external]));
  assert.deepEqual(await calls(directory), [...(process.platform === 'linux' ? ['icons'] : []), 'install']);
  assert.equal(await readFile(join(directory, 'installed-source'), 'utf8'), external);
  successful(cli(directory, 'install.mjs', [`--platform=${platform}`, '--uninstall']));
  assert.equal((await calls(directory)).at(-1), 'uninstall');
});

test('构建失败阻止打包和安装，失败状态不被记录为最新', async t => {
  const { directory, platform } = await fixture(t);
  await writeFile(join(directory, 'fail-renderer'), 'fail');
  const result = cli(directory, 'install.mjs', [`--platform=${platform}`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /renderer 构建失败/);
  assert.deepEqual(await calls(directory), initialBuild());
  await assert.rejects(access(join(directory, '.dev/build-state/renderer.json')), { code: 'ENOENT' });
  await assert.rejects(access(join(directory, 'installed-source')), { code: 'ENOENT' });
  await rm(join(directory, 'fail-renderer'));
  successful(cli(directory, 'install.mjs', [`--platform=${platform}`]));
  assert.deepEqual(await calls(directory), [...initialBuild(), 'renderer', 'package', 'install']);
});
