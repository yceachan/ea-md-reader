import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const appId = 'io.github.yceachan.emd';
const launchServices = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const posixOnly = { skip: process.platform === 'win32' && 'macOS 安装夹具需要 POSIX shell、权限和框架符号链接' };
const missing = (file) => assert.rejects(access(file), { code: 'ENOENT' });

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'emd-mac-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home with ' quote %");
  const root = join(directory, 'repository');
  const target = join(home, 'Applications/emd.app');
  const launcher = join(home, '.local/bin/emd');
  const log = join(home, 'Library/Logs/emd/emd.log');
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args });
    if (command === '/usr/bin/plutil') {
      assert.deepEqual(args.slice(0, 5), ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-']);
      assert.equal(options.encoding, 'utf8');
      const xml = readFileSync(args[5], 'utf8');
      const match = xml.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
      if (!match) throw new Error('Invalid fixture Info.plist');
      return `${match[1]}\n`;
    }
    if (command === '/usr/bin/ditto') {
      cpSync(args[0], args[1], { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
      return '';
    }
    assert.equal(command.split('/').at(-1), 'lsregister', `Unexpected external command: ${command}`);
    return '';
  };
  await mkdir(root, { recursive: true });
  return { directory, home, root, target, launcher, log, calls, run };
}

async function bundle(path, { id = appId, contents = 'version one', executable = '#!/bin/sh\nexit 0\n' } = {}) {
  await mkdir(join(path, 'Contents/MacOS'), { recursive: true });
  await mkdir(join(path, 'Contents/Frameworks/Demo.framework/Versions/A'), { recursive: true });
  await writeFile(join(path, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string></dict></plist>`);
  await writeFile(join(path, 'Contents/MacOS/emd'), executable, { mode: 0o755 });
  await writeFile(join(path, 'Contents/Resources.txt'), contents);
  await writeFile(join(path, 'Contents/Frameworks/Demo.framework/Versions/A/Demo'), 'framework');
  await symlink('A', join(path, 'Contents/Frameworks/Demo.framework/Versions/Current'));
  await symlink('Versions/Current/Demo', join(path, 'Contents/Frameworks/Demo.framework/Demo'));
  return path;
}

async function waitForFile(file, ready = () => true) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const value = await readFile(file, 'utf8');
      if (ready(value)) return value;
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Launcher did not write ${file}`);
}

test('macOS 打包包含应用、DMG、ZIP 和只读 Markdown / HTML 文件关联', async () => {
  const { packOptions } = await import('../scripts/platforms/mac.mjs');
  assert.deepEqual(packOptions.mac, ['dir', 'dmg', 'zip']);
  const mac = packOptions.config.mac;
  assert.equal(mac.icon, 'assets/emd.svg');
  assert.equal(mac.identity, '-');
  assert.equal(mac.hardenedRuntime, false);
  assert.equal(mac.notarize, false);
  const associations = Array.isArray(mac.fileAssociations) ? mac.fileAssociations : [mac.fileAssociations];
  const extensions = associations.flatMap((association) => {
    assert.equal(association.role, 'Viewer');
    assert.equal(association.rank, 'Alternate');
    return association.ext;
  });
  assert.deepEqual(extensions.toSorted(), ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx', 'html', 'htm'].toSorted());
});

test('macOS 安装保留框架链接和权限，启动器传递字面参数与调用目录', posixOnly, async (t) => {
  const { install } = await import('../scripts/platforms/mac.mjs');
  const context = await fixture(t);
  const capture = join(context.directory, 'launch arguments');
  const working = join(context.directory, '工作 目录');
  await mkdir(working);
  const source = await bundle(join(context.directory, "source ' space/emd.app"), {
    executable: `#!/bin/sh\nprintf '%s\\n' "$PWD" "$@" > ${quote(capture)}\nprintf 'application log\\n'\n`,
  });
  await install({ ...context, source });
  assert.ok((await stat(join(context.target, 'Contents/MacOS/emd'))).mode & 0o111);
  assert.ok((await stat(context.launcher)).mode & 0o111);
  assert.equal(await readlink(join(context.target, 'Contents/Frameworks/Demo.framework/Versions/Current')), 'A');
  assert.equal(await readlink(join(context.target, 'Contents/Frameworks/Demo.framework/Demo')), 'Versions/Current/Demo');
  assert.equal(await readFile(join(context.target, 'Contents/Frameworks/Demo.framework/Demo'), 'utf8'), 'framework');
  const launcher = await readFile(context.launcher, 'utf8');
  assert.ok(launcher.includes('# ea-md-reader macOS launcher'));
  assert.match(launcher, /nohup/);
  execFileSync('/bin/sh', ['-n', context.launcher]);
  const args = ['文档 空格.md', "quote's.md", '--', '-draft.md', 'literal $() %.md'];
  const result = spawnSync('/bin/sh', [context.launcher, ...args], { cwd: working, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  const captured = await waitForFile(capture, (text) => text.trimEnd().split('\n').length === args.length + 1);
  assert.deepEqual(captured.trimEnd().split('\n'), [await realpath(working), ...args]);
  assert.match(await waitForFile(context.log, (text) => text.includes('application log')), /application log/);
  const registrations = context.calls.filter(({ command }) => command.endsWith('/lsregister'));
  assert.deepEqual(registrations.map(({ args }) => args), [['-f', context.target]]);
});

test('macOS 默认产物目录和解包目录均能安装，升级清除旧包文件', posixOnly, async (t) => {
  const { install } = await import('../scripts/platforms/mac.mjs');
  const context = await fixture(t);
  const output = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
  await bundle(join(context.root, 'release', output, 'emd.app'));
  await install(context);
  await writeFile(join(context.target, 'Contents/obsolete.txt'), 'old file');
  const source = join(context.directory, 'unpacked');
  await bundle(join(source, 'emd.app'), { contents: 'version two' });
  await install({ ...context, source });
  assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'version two');
  await missing(join(context.target, 'Contents/obsolete.txt'));
  assert.deepEqual(await readdir(dirname(context.target)), ['emd.app']);
});

test('macOS 无效源包、复制失败与注册失败保留已有安装', posixOnly, async (t) => {
  const { install } = await import('../scripts/platforms/mac.mjs');
  const context = await fixture(t);
  const source = await bundle(join(context.directory, 'original/emd.app'));
  await install({ ...context, source });
  const launcher = await readFile(context.launcher, 'utf8');
  const invalid = await bundle(join(context.directory, 'invalid/emd.app'), { id: 'io.example.other' });
  await assert.rejects(install({ ...context, source: invalid }));
  const incomplete = await bundle(join(context.directory, 'incomplete/emd.app'));
  await rm(join(incomplete, 'Contents/MacOS/emd'));
  await assert.rejects(install({ ...context, source: incomplete }));
  const nonExecutable = await bundle(join(context.directory, 'non-executable/emd.app'));
  await chmod(join(nonExecutable, 'Contents/MacOS/emd'), 0o644);
  await assert.rejects(install({ ...context, source: nonExecutable }));
  await assert.rejects(install({ ...context, source: join(context.directory, 'missing/emd.app') }));
  assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'version one');
  assert.equal(await readFile(context.launcher, 'utf8'), launcher);
  const upgrade = await bundle(join(context.directory, 'upgrade/emd.app'), { contents: 'version two' });
  const run = (command, args, options) => {
    if (command === '/usr/bin/ditto') throw new Error('copy failed');
    return context.run(command, args, options);
  };
  await assert.rejects(install({ ...context, source: upgrade, run }), /copy failed/);
  assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'version one');
  assert.equal(await readFile(context.launcher, 'utf8'), launcher);
  assert.deepEqual(await readdir(dirname(context.target)), ['emd.app']);
  let registrationFailed = false;
  const failedRegistration = (command, args, options) => {
    if (command.endsWith('/lsregister') && args[0] === '-f' && !registrationFailed) {
      registrationFailed = true;
      throw new Error('registration failed');
    }
    return context.run(command, args, options);
  };
  await assert.rejects(install({ ...context, source: upgrade, run: failedRegistration }), /registration failed/);
  assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'version one');
  assert.equal(await readFile(context.launcher, 'utf8'), launcher);
  assert.deepEqual(await readdir(dirname(context.target)), ['emd.app']);
});

for (const upgrade of [false, true]) {
  test(`macOS ${upgrade ? '升级' : '首次安装'}注册后启动器提交失败恢复注册与原文件`, posixOnly, async (t) => {
    const { install } = await import('../scripts/platforms/mac.mjs');
    const context = await fixture(t);
    const registration = new Map();
    let failLauncher = false;
    const run = (command, args, options) => {
      const result = context.run(command, args, options);
      if (command.endsWith('/lsregister')) {
        if (args[0] === '-u') registration.delete(args[1]);
        else {
          registration.set(args[1], readFileSync(join(args[1], 'Contents/Resources.txt'), 'utf8'));
          if (failLauncher) {
            failLauncher = false;
            // Delete the staged command after registration to fail its final rename.
            const temporary = readdirSync(dirname(context.launcher)).find((name) => name.startsWith('.emd-install-'));
            assert.ok(temporary);
            rmSync(join(dirname(context.launcher), temporary));
          }
        }
      }
      return result;
    };
    let originalLauncher;
    if (upgrade) {
      const original = await bundle(join(context.directory, 'original/emd.app'));
      await install({ ...context, source: original, run });
      originalLauncher = await readFile(context.launcher);
    }
    const source = await bundle(join(context.directory, 'new/emd.app'), { contents: 'version two' });
    const sourceBinary = await readFile(join(source, 'Contents/MacOS/emd'));
    failLauncher = true;
    await assert.rejects(install({ ...context, source, run }), { code: 'ENOENT' });
    assert.equal(registration.get(context.target), upgrade ? 'version one' : undefined);
    if (upgrade) {
      assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'version one');
      assert.deepEqual(await readFile(context.launcher), originalLauncher);
      assert.equal(await readlink(join(context.target, 'Contents/Frameworks/Demo.framework/Versions/Current')), 'A');
    } else {
      await missing(context.target);
      await missing(context.launcher);
    }
    assert.equal(await readFile(join(source, 'Contents/Resources.txt'), 'utf8'), 'version two');
    assert.deepEqual(await readFile(join(source, 'Contents/MacOS/emd')), sourceBinary);
    assert.equal(await readlink(join(source, 'Contents/Frameworks/Demo.framework/Demo')), 'Versions/Current/Demo');
    assert.deepEqual(await readdir(dirname(context.target)), upgrade ? ['emd.app'] : []);
    assert.deepEqual(await readdir(dirname(context.launcher)), upgrade ? ['emd'] : []);
    const operations = context.calls.filter(({ command }) => command.endsWith('/lsregister')).map(({ args }) => args[0]);
    assert.deepEqual(operations, upgrade ? ['-f', '-f', '-u', '-f'] : ['-f', '-u']);
  });
}

test('macOS 注册恢复失败同时报告原故障并继续恢复旧包和启动器', posixOnly, async (t) => {
  const { install } = await import('../scripts/platforms/mac.mjs');
  for (const failure of ['unregister', 'restore']) {
    await t.test(failure, async (t) => {
      const context = await fixture(t);
      const original = await bundle(join(context.directory, 'original/emd.app'));
      await install({ ...context, source: original });
      const originalLauncher = await readFile(context.launcher);
      const source = await bundle(join(context.directory, 'new/emd.app'), { contents: 'version two' });
      const recoveryError = new Error(`${failure} registration failed`);
      let registrations = 0;
      const run = (command, args, options) => {
        if (command.endsWith('/lsregister')) {
          const expected = args[0] === '-f' && registrations === 1 ? 'version one' : 'version two';
          assert.equal(readFileSync(join(context.target, 'Contents/Resources.txt'), 'utf8'), expected);
          if ((failure === 'unregister' && args[0] === '-u') || (failure === 'restore' && args[0] === '-f' && registrations === 1)) throw recoveryError;
        }
        const result = context.run(command, args, options);
        if (command.endsWith('/lsregister') && args[0] === '-f' && registrations++ === 0) {
          const temporary = readdirSync(dirname(context.launcher)).find((name) => name.startsWith('.emd-install-'));
          assert.ok(temporary);
          rmSync(join(dirname(context.launcher), temporary));
        }
        return result;
      };
      await assert.rejects(install({ ...context, source, run }), (error) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors[0].code, 'ENOENT');
        assert.equal(error.errors[1], recoveryError);
        assert.match(error.message, /ENOENT/);
        assert.ok(error.message.includes(recoveryError.message));
        return true;
      });
      assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'version one');
      assert.deepEqual(await readFile(context.launcher), originalLauncher);
      assert.equal(await readlink(join(context.target, 'Contents/Frameworks/Demo.framework/Versions/Current')), 'A');
      assert.deepEqual(await readdir(dirname(context.target)), ['emd.app']);
      assert.deepEqual(await readdir(dirname(context.launcher)), ['emd']);
    });
  }
});

// lsregister's diagnostic format is not a public API. Fail if the expected fields disappear.
function registeredClaims(dump, target) {
  const records = dump.split(/^[ \t]*-{10,}[ \t]*$/m);
  const bundles = records.filter((record) => /^[ \t]*bundle id:/m.test(record));
  assert.ok(bundles.length, '无法识别 lsregister -dump 的 bundle id 字段，请检查保存的原输出。');
  const matches = bundles.filter((record) => {
    const path = record.match(/^[ \t]*path:[ \t]*(.+)$/m)?.[1].trim().replace(/ \(0x[\da-f]+\)$/i, '');
    return path === target;
  });
  assert.ok(matches.length <= 1, 'lsregister -dump 返回了多条目标路径记录。');
  if (!matches.length) {
    assert.ok(!dump.includes(target), '无法识别 lsregister -dump 的目标路径字段，请检查保存的原输出。');
    return '';
  }
  const identifier = matches[0].match(/^[ \t]*bundle id:[ \t]*(.+)$/m)[1].trim();
  const claims = records.filter((record) => /^[ \t]*claim id:/m.test(record) && record.match(/^[ \t]*bundle:[ \t]*(.+)$/m)?.[1].trim() === identifier);
  assert.ok(claims.length, '目标包没有可识别的注册绑定，请检查保存的原输出。');
  return claims.map((record) => {
    const bindings = record.match(/^[ \t]*bindings:[ \t]*(.+)$/m);
    assert.ok(bindings, '无法识别 lsregister -dump 的 bindings 字段，请检查保存的原输出。');
    return bindings[1].trim();
  }).join('\n');
}

for (const upgrade of [false, true]) {
  test(`macOS 原生 ${upgrade ? '升级' : '首次安装'}启动器失败恢复 LaunchServices 绑定`, { skip: process.platform !== 'darwin' && '需要 macOS 原生 plutil、ditto 和 LaunchServices' }, async (t) => {
    const { install, uninstall } = await import('../scripts/platforms/mac.mjs');
    const context = await fixture(t);
    const artifactDirectory = join(process.cwd(), 'test-results', 'mac-registration', `${process.arch}-${upgrade ? 'upgrade' : 'first-install'}`);
    mkdirSync(artifactDirectory, { recursive: true });
    const marker = context.directory.split('/').at(-1).toLowerCase();
    const oldExtension = `${marker}-old`, newExtension = `${marker}-new`;
    const createBundle = async (path, extension, contents) => {
      await bundle(path, { contents });
      await writeFile(join(path, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${appId}</string>
<key>CFBundleName</key><string>emd</string>
<key>CFBundleExecutable</key><string>emd</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1.0</string>
<key>CFBundleDocumentTypes</key><array><dict>
<key>CFBundleTypeName</key><string>${extension}</string>
<key>CFBundleTypeExtensions</key><array><string>${extension}</string></array>
<key>CFBundleTypeRole</key><string>Viewer</string>
<key>LSHandlerRank</key><string>Alternate</string>
</dict></array></dict></plist>`);
      return path;
    };
    const snapshot = (name) => {
      const dump = execFileSync(launchServices, ['-dump'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      writeFileSync(join(artifactDirectory, `${name}.txt`), dump);
      return registeredClaims(dump, context.target);
    };
    let originalLauncher;
    try {
      assert.equal(snapshot('before-install'), '');
      if (upgrade) {
        const original = await createBundle(join(context.directory, 'original/emd.app'), oldExtension, 'version one');
        await install({ ...context, source: original, run: execFileSync });
        assert.ok(snapshot('original-registration').includes(oldExtension));
        originalLauncher = await readFile(context.launcher);
      }
      const source = await createBundle(join(context.directory, 'new/emd.app'), newExtension, 'version two');
      const sourcePlist = await readFile(join(source, 'Contents/Info.plist'));
      let failLauncher = true;
      const run = (command, args, options) => {
        const result = execFileSync(command, args, options);
        if (command === launchServices && args[0] === '-f' && failLauncher) {
          failLauncher = false;
          assert.ok(snapshot('new-registration').includes(newExtension));
          const temporary = readdirSync(dirname(context.launcher)).find((name) => name.startsWith('.emd-install-'));
          assert.ok(temporary);
          rmSync(join(dirname(context.launcher), temporary));
        }
        return result;
      };
      await assert.rejects(install({ ...context, source, run }), { code: 'ENOENT' });
      const restored = snapshot('after-rollback');
      assert.ok(!restored.includes(newExtension), '失败的新包绑定仍在目标注册中。');
      if (upgrade) {
        assert.ok(restored.includes(oldExtension), '旧包绑定没有恢复。');
        assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'version one');
        assert.deepEqual(await readFile(context.launcher), originalLauncher);
        assert.equal(await readlink(join(context.target, 'Contents/Frameworks/Demo.framework/Versions/Current')), 'A');
      } else {
        assert.equal(restored, '');
        await missing(context.target);
        await missing(context.launcher);
      }
      assert.deepEqual(await readFile(join(source, 'Contents/Info.plist')), sourcePlist);
    } finally {
      await uninstall({ home: context.home, run: execFileSync });
    }
  });
}

test('macOS 拒绝覆盖或卸载不属于 emd 的应用和命令', posixOnly, async (t) => {
  const { install, uninstall } = await import('../scripts/platforms/mac.mjs');
  const context = await fixture(t);
  const source = await bundle(join(context.directory, 'source/emd.app'));
  await bundle(context.target, { id: 'io.example.other', contents: 'foreign app' });
  await assert.rejects(install({ ...context, source }));
  await assert.rejects(uninstall(context));
  assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'foreign app');
  await rm(context.target, { recursive: true });
  await mkdir(dirname(context.launcher), { recursive: true });
  await writeFile(context.launcher, '#!/bin/sh\necho foreign command\n', { mode: 0o755 });
  await assert.rejects(install({ ...context, source }));
  await assert.rejects(uninstall(context));
  await missing(context.target);
  assert.equal(await readFile(context.launcher, 'utf8'), '#!/bin/sh\necho foreign command\n');
  await bundle(context.target, { contents: 'owned app beside foreign command' });
  await assert.rejects(install({ ...context, source }));
  await assert.rejects(uninstall(context));
  assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'owned app beside foreign command');
  assert.equal(context.calls.filter(({ command }) => command.endsWith('/lsregister')).length, 0);
});

test('macOS 拒绝目标应用中被替换成链接的可执行文件', posixOnly, async (t) => {
  const { install, uninstall } = await import('../scripts/platforms/mac.mjs');
  const context = await fixture(t);
  const source = await bundle(join(context.directory, 'source/emd.app'));
  await install({ ...context, source });
  const executable = join(context.target, 'Contents/MacOS/emd');
  const foreign = join(context.directory, 'foreign executable');
  await writeFile(foreign, '#!/bin/sh\necho foreign\n', { mode: 0o755 });
  await rm(executable);
  await symlink(foreign, executable);
  await assert.rejects(install({ ...context, source }));
  await assert.rejects(uninstall(context));
  assert.ok((await lstat(executable)).isSymbolicLink());
  assert.equal(await readFile(foreign, 'utf8'), '#!/bin/sh\necho foreign\n');
  assert.equal(await readFile(join(context.target, 'Contents/Resources.txt'), 'utf8'), 'version one');
});

test('macOS 拒绝应用和命令路径的符号链接，不修改链接目标', posixOnly, async (t) => {
  const { install, uninstall } = await import('../scripts/platforms/mac.mjs');
  const context = await fixture(t);
  const source = await bundle(join(context.directory, 'source/emd.app'));
  await mkdir(dirname(context.target), { recursive: true });
  await symlink(source, context.target);
  await assert.rejects(install({ ...context, source }));
  await assert.rejects(uninstall(context));
  assert.ok((await lstat(context.target)).isSymbolicLink());
  assert.equal(await readFile(join(source, 'Contents/Resources.txt'), 'utf8'), 'version one');
  await rm(context.target);
  await mkdir(dirname(context.launcher), { recursive: true });
  const foreign = join(context.directory, 'foreign command');
  await writeFile(foreign, '# ea-md-reader macOS launcher\nforeign command\n');
  await symlink(foreign, context.launcher);
  await assert.rejects(install({ ...context, source }));
  await assert.rejects(uninstall(context));
  assert.ok((await lstat(context.launcher)).isSymbolicLink());
  assert.equal(await readFile(foreign, 'utf8'), '# ea-md-reader macOS launcher\nforeign command\n');
  await missing(context.target);
});

test('macOS 卸载可重复执行并保留用户配置和日志', posixOnly, async (t) => {
  const { install, uninstall } = await import('../scripts/platforms/mac.mjs');
  const context = await fixture(t);
  const source = await bundle(join(context.directory, 'source/emd.app'));
  await install({ ...context, source });
  const profile = join(context.home, 'Library/Application Support/emd/preferences.json');
  await mkdir(dirname(profile), { recursive: true });
  await writeFile(profile, '{"retained":true}');
  await writeFile(context.log, '日志保留');
  const failedUnregistration = (command, args, options) => {
    if (command.endsWith('/lsregister') && args[0] === '-u') throw new Error('unregistration failed');
    return context.run(command, args, options);
  };
  await assert.rejects(uninstall({ ...context, run: failedUnregistration }), /unregistration failed/);
  await access(context.target);
  await access(context.launcher);
  await uninstall(context);
  await uninstall(context);
  await missing(context.target);
  await missing(context.launcher);
  assert.equal(await readFile(profile, 'utf8'), '{"retained":true}');
  assert.equal(await readFile(context.log, 'utf8'), '日志保留');
  const registrations = context.calls.filter(({ command }) => command.endsWith('/lsregister'));
  assert.deepEqual(registrations.map(({ args }) => args), [['-f', context.target], ['-u', context.target]]);
});
