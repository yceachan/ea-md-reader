const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Marked } = require('marked');
const markedKatex = require('marked-katex-extension');
const katex = require('katex');
const esbuild = require('esbuild');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const documentPath = process.argv[2];
if (!documentPath) throw new Error('Usage: node probe.cjs <markdown-path>');

// Compare the immutable pre-fix renderer with the real working-tree renderer.
const baselineRevision = 'd4ef9d310cb1178de3e99e62d077dd30b5b2562c';

async function bundle(candidate) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/lib/markdown.ts')],
    bundle: true, write: false, format: 'iife', globalName: 'readerMarkdown',
    platform: 'browser', logLevel: 'silent',
    plugins: [{ name: 'baseline-comparison', setup(build) {
      build.onLoad({ filter: /[\\/]src[\\/]lib[\\/]markdown\.ts$/ }, async ({ path: sourcePath }) => {
        const source = candidate ? await fs.readFile(sourcePath, 'utf8')
          : execFileSync('git', ['show', `${baselineRevision}:src/lib/markdown.ts`], { cwd: root, encoding: 'utf8' });
        return { contents: source, loader: 'ts', resolveDir: path.dirname(sourcePath) };
      });
    } }],
  });
  return result.outputFiles[0].text;
}

(async () => {
  const source = await fs.readFile(documentPath, 'utf8');
  const normalized = source.replace(/\r\n?/g, '\n');
  const formula = normalized.match(/\$\$\\beta_\{FM\}[\s\S]*?\$\$/)[0];
  const md = new Marked({ gfm: true, breaks: false });
  md.use(markedKatex({ throwOnError: false, nonStandard: true }));
  const block = formula.slice(2, -2);
  const direct = katex.renderToString(block, { displayMode: true, throwOnError: true });
  const standard = `$$\n${block}\n$$`;
  const compactDisplays = [...normalized.matchAll(/^\$\$(?!\$)([\s\S]*?)\$\$/gm)];
  const preliminary = {
    baselineRevision,
    versions: Object.fromEntries(['marked', 'marked-katex-extension', 'katex'].map((name) => [name, require(`${name}/package.json`).version])),
    formula, directKatexValid: direct.includes('class="katex"'),
    currentTokens: md.lexer(formula),
    standardTokens: md.lexer(standard).map(({ type, text, displayMode }) => ({ type, text, displayMode })),
    displayCount: compactDisplays.length,
    multilineCompactCount: compactDisplays.filter((match) => match[1].includes('\n')).length,
  };
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const cases = {
      reported: formula,
      singleLine: '$$x+y=z$$',
      standalone: '$$\nx+y=z\n$$',
      standaloneBlank: '$$\nx+y\n\n=z\n$$',
      openingAlone: '$$\nx+y\n=z$$',
      closingAlone: '$$x+y\n=z\n$$',
      aligned: '$$\\begin{aligned}\na&=b\\\\\nc&=d\n\\end{aligned}$$',
      adjacentDisplays: '$$a\n=b$$\n\n$$c\n=d$$',
      codeFence: '```tex\n$$a\n=b$$\n```',
      inlineCode: '`$$a = b$$`',
      escaped: '\\$\\$a\n=b\\$\\$',
      inlineCjk: '公式 $x$（说明）；$y$。',
      singleDollarMultiline: '$a\n=b$',
      unclosed: '$$a\n=b',
      paragraphBoundary: '$$a\n\n正文\n$$b\n=c$$',
      quote: '> $$a\n> =b$$',
      list: '- $$a\n  =b$$',
      callout: ':::callout 💡\n$$a\n=b$$\n:::',
      calloutWithoutIcon: ':::callout\n$$a\n=b$$\n:::',
      escapedDollarInMath: '$$a+\\$\n=b$$',
      tripleDollar: '$$$a\n=b$$$',
      indentedCode: '    $$a\n    =b$$',
      crlf: formula.replace(/\n/g, '\r\n'),
      document: source,
    };
    const results = {};
    for (const [label, candidate] of [['baseline', false], ['fixed', true]]) {
      const page = await browser.newPage();
      await page.addScriptTag({ content: await bundle(candidate) });
      results[label] = {};
      for (const [name, input] of Object.entries(cases)) {
        results[label][name] = await page.evaluate(async (src) => {
          const result = await readerMarkdown.renderMarkdown(src);
          const template = document.createElement('template');
          template.innerHTML = result.html;
          const dom = template.content;
          return {
            math: dom.querySelectorAll('.katex').length,
            display: dom.querySelectorAll('.katex-display').length,
            errors: dom.querySelectorAll('.katex-error').length,
            literalDelimiters: [...dom.querySelectorAll('p')].filter((p) => p.textContent.includes('$$')).length,
            ...(src.length < 600 ? { html: result.html } : {}),
          };
        }, input);
      }
      await page.close();
    }
    const report = { ...preliminary, results };
    await fs.writeFile(path.join(__dirname, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    assert.equal(results.baseline.reported.math, 0);
    assert.equal(results.fixed.reported.display, 1);
    assert.equal(results.fixed.reported.errors, 0);
    for (const name of ['codeFence', 'inlineCode', 'escaped', 'inlineCjk', 'singleDollarMultiline', 'unclosed', 'tripleDollar', 'indentedCode', 'singleLine', 'standalone', 'standaloneBlank', 'paragraphBoundary', 'calloutWithoutIcon']) {
      assert.deepEqual(results.fixed[name], results.baseline[name], name);
    }
    for (const name of ['openingAlone', 'closingAlone', 'aligned', 'quote', 'list', 'callout', 'escapedDollarInMath', 'crlf']) {
      assert.equal(results.fixed[name].display, 1, name);
      assert.equal(results.fixed[name].errors, 0, name);
    }
    assert.equal(results.fixed.adjacentDisplays.display, 2);
    assert.equal(results.baseline.document.display, preliminary.displayCount - preliminary.multilineCompactCount);
    assert.equal(results.fixed.document.display, preliminary.displayCount);
    assert.equal(results.fixed.document.literalDelimiters, 0);
    assert.equal(results.fixed.document.errors, 0);
    console.log(JSON.stringify({ ...preliminary, currentTokens: undefined, standardTokens: undefined,
      results: Object.fromEntries(Object.entries(results).map(([label, rows]) => [label, Object.fromEntries(Object.entries(rows).map(([name, row]) => [name, { ...row, html: undefined }]))])),
    }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
