const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { applicationHelper } = require('../electron/platforms/windows-editor.cjs');

test('Windows Shell 应用枚举无头运行，返回可持久化的程序路径', { skip: process.platform !== 'win32' }, () => {
  for (const extension of ['.md', '.html']) {
    const entries = JSON.parse(execFileSync(applicationHelper(), ['list', extension], { encoding: 'utf8', windowsHide: true }));
    assert.ok(Array.isArray(entries));
    assert.equal(new Set(entries.map(entry => entry.program.toLowerCase())).size, entries.length);
    for (const entry of entries) {
      assert.ok(entry.name);
      assert.match(entry.program, /\.exe$/i);
      assert.ok(fs.statSync(entry.program).isFile());
    }
  }
  assert.throws(() => execFileSync(applicationHelper(), ['list', '.invalid'], { stdio: 'pipe', windowsHide: true }));
});
