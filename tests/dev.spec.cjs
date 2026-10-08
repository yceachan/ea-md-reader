const { test, expect } = require('@playwright/test');
const { launch, close } = require('./electron-fixture.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('Vite 开发页面保留 IPC、HTML 隔离与资料加载，CSS 热更新和整页重载可用', async () => {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'emd-dev-ui-')));
  let server, application;
  const errors = [];
  try {
    for (const name of ['src', 'assets/emd.svg', 'index.html', 'package.json']) await fs.cp(path.resolve(name), path.join(directory, name), { recursive: true });
    await fs.symlink(path.resolve('node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const profile = path.join(directory, 'profile'); await fs.mkdir(profile);
    await fs.writeFile(path.join(profile, 'setting.toml'), '[profile]\nname="yceachan"\ntagline="Development"\nemail="yceachan@foxmail.com"\ngithub="https://github.com/yceachan"\nrepository="https://github.com/yceachan/ea-md-reader"\ncopyright="2026"\nlicense="MIT"\nprofile-photo="profile-photo.jpg"\n');
    const markdown = path.join(directory, '开发.md'); await fs.writeFile(markdown, '# 开发页面\n');
    const html = path.join(directory, '页面.html'); await fs.writeFile(html, '<h1>开发 HTML</h1><script>document.body.dataset.bridge=typeof window.emd</script>');
    // Finish fixtures before Vite watches HTML files and broadcasts reloads.
    const { createServer } = await import('vite');
    server = await createServer({ root: directory, configFile: path.resolve('vite.config.ts'), server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/profile/**'] } } });
    await server.listen();
    const url = new URL('index.html', server.resolvedUrls.local[0]).href;
    application = await launch({ args: [path.resolve('.'), ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []), `--user-data-dir=${profile}`, markdown, html], env: { ...process.env, EMD_DEV_URL: url } });
    const page = await application.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByRole('tab')).toHaveCount(2, { timeout: 30000 });
    expect(page.url()).toBe(url);
    await expect(page.frameLocator('.html-page').getByRole('heading', { name: '开发 HTML' })).toBeVisible();
    expect(await page.frameLocator('.html-page').locator('body').getAttribute('data-bridge')).toBe('undefined');
    await page.getByRole('tab', { name: 'MD 开发.md', exact: true }).click();
    await expect(page.locator('.vp-doc h1')).toHaveText('开发页面');
    await page.getByRole('button', { name: '个人资料', exact: true }).click();
    await expect.poll(() => page.locator('.profile-photo').evaluate(image => image.naturalWidth)).toBe(512);
    await page.getByRole('button', { name: '关闭个人资料', exact: true }).click();
    await fs.appendFile(path.join(directory, 'src/app.css'), '\n.wordmark { font-size: 37px; }\n');
    await expect(page.locator('.wordmark')).toHaveCSS('font-size', '37px');
    await expect(page.getByRole('tab')).toHaveCount(2);
    const reloaded = page.waitForEvent('load');
    server.ws.send({ type: 'full-reload' });
    await reloaded;
    await expect(page.locator('.wordmark')).toHaveCSS('font-size', '37px');
    await expect(page.getByRole('tab')).toHaveCount(2);
    await expect(page.locator('.vp-doc h1')).toHaveText('开发页面');
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
    expect(errors).toEqual([]);
  } finally {
    try { if (application) await close(application); }
    finally { try { if (server) await server.close(); } finally { await fs.rm(directory, { recursive: true, force: true }); } }
  }
});
