import { cp, mkdir, readFile, rm, writeFile, chmod, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

export const packOptions = {
  linux: ['dir', 'tar.gz'],
  config: {
    extraResources: [{ from: 'native-build/emd-application-chooser', to: 'emd-application-chooser' }, { from: 'native-build/emd-kde-startup', to: 'emd-kde-startup' }],
    linux: { category: 'Office', icon: 'assets/emd.png', syncDesktopName: true },
    extraMetadata: { desktopName: 'io.github.yceachan.emd.desktop' },
  },
};

const iconName = 'io.github.yceachan.emd';
const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512];
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function locations(home) {
  const data = process.env.XDG_DATA_HOME || join(home, '.local/share');
  const state = process.env.XDG_STATE_HOME || join(home, '.local/state');
  return {
    data, state, bin: join(home, '.local/bin'), target: join(data, 'emd'),
    desktop: join(data, `applications/${iconName}.desktop`),
    icon: join(data, `icons/hicolor/scalable/apps/${iconName}.svg`),
    rasterIcons: iconSizes.map((size) => join(data, `icons/hicolor/${size}x${size}/apps/${iconName}.png`)),
  };
}

function refreshDesktopIntegration(data) {
  execFileSync('update-desktop-database', [join(data, 'applications')]);
  if (process.env.XDG_CURRENT_DESKTOP?.split(':').includes('KDE')) {
    execFileSync('kbuildsycoca6', ['--noincremental']);
  }
}

export async function uninstall({ home }) {
  const { data, bin, target, desktop, icon, rasterIcons } = locations(home);
  for (const file of [target, desktop, icon, ...rasterIcons, join(bin, 'emd')]) await rm(file, { force: true, recursive: true });
  refreshDesktopIntegration(data);
  console.log('已移除用户级 emd 安装；配置和日志保留。');
}

export async function install({ root, home, source = join(root, 'release/linux-unpacked') }) {
  const { data, state, bin, target, desktop, icon, rasterIcons } = locations(home);
  await access(join(source, 'emd'));
  for (const directory of [target, bin, dirname(desktop), dirname(icon), join(state, 'emd')]) await mkdir(directory, { recursive: true });
  await cp(source, target, { recursive: true });
  await chmod(join(target, 'emd'), 0o755);
  // setsid plus redirected stdio detaches the application from the invoking shell.
  const launcher = `#!/bin/sh\nset -eu\nif ! command -v setsid >/dev/null 2>&1; then\n  echo 'emd requires setsid (util-linux).' >&2\n  exit 1\nfi\nmkdir -p ${quote(join(state, 'emd'))}\nsetsid ${quote(join(target, 'emd'))} "$@" </dev/null >>${quote(join(state, 'emd/emd.log'))} 2>&1 &\n`;
  await writeFile(join(bin, 'emd'), launcher, { mode: 0o755 });
  const template = await readFile(join(root, 'assets/emd.desktop'), 'utf8');
  // Desktop Exec escaping follows the freedesktop specification, not shell quoting.
  const desktopExecutable = '"' + join(bin, 'emd').replace(/[\\"`$]/g, '\\$&').replaceAll('%', '%%') + '"';
  await writeFile(desktop, template.replace('Exec=emd %F', `Exec=${desktopExecutable} %F`).replace('TryExec=emd', `TryExec=${join(bin, 'emd')}`).replace('Icon=io.github.yceachan.emd', `Icon=${rasterIcons[iconSizes.indexOf(256)]}`));
  await cp(join(root, 'assets/emd.svg'), icon);
  for (let index = 0; index < iconSizes.length; index++) {
    await mkdir(dirname(rasterIcons[index]), { recursive: true });
    await cp(join(root, `assets/icons/${iconSizes[index]}.png`), rasterIcons[index]);
  }
  // Remove the previous icon name after upgrading to the desktop application ID.
  await rm(join(data, 'icons/hicolor/scalable/apps/emd.svg'), { force: true });
  execFileSync('desktop-file-validate', [desktop]);
  refreshDesktopIntegration(data);
  console.log(`已安装 emd：${join(bin, 'emd')}\n桌面 / Dolphin 入口：${desktop}`);
}
