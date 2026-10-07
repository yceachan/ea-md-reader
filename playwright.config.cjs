const { join } = require('node:path');
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: ['reader.spec.cjs', 'commands.spec.cjs', 'ui.spec.cjs', 'editors.spec.cjs'], workers: 1, timeout: 90000,
  outputDir: join(__dirname, 'test-results', 'reader'), reporter: 'line',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
