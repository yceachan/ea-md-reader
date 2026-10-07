const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

async function windowGeometry(application) {
  const pid = await application.evaluate(() => process.pid);
  const token = randomUUID().replaceAll('-', '');
  const service = `io.github.yceachan.Emd.Layout.test${token}`, plugin = `emd-test-${token}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emd-kde-query-'));
  try {
    const file = path.join(directory, 'query.js');
    await fs.writeFile(file, `(function () {
      function report(window) {
        if (window.pid !== ${pid} || !window.normalWindow || window.dialog || window.transient) return;
        workspace.windowAdded.disconnect(report);
        const output = workspace.screenAt(workspace.cursorPos);
        const area = workspace.clientArea(KWin.MaximizeArea, output, workspace.currentDesktopForScreen(output));
        const frame = window.frameGeometry;
        callDBus('${service}', '/Layout', 'io.github.yceachan.Emd.Layout', 'Report', JSON.stringify({event:'applied', geometry:{x:frame.x,y:frame.y,width:frame.width,height:frame.height}, area:{x:area.x,y:area.y,width:area.width,height:area.height}, output:window.output.name, pointerOutput:output.name}));
      }
      workspace.windowAdded.connect(report);
      workspace.windowList().forEach(report);
    })();`);
    return await new Promise((resolve, reject) => {
      const child = spawn(path.resolve('native-build/emd-kde-startup'), [file, service, plugin], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
      child.once('error', reject);
      child.once('close', code => {
        try { if (code !== 0) throw new Error(stderr); resolve(JSON.parse(stdout.trim())); }
        catch (error) { reject(error); }
      });
    });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
module.exports = { windowGeometry };
