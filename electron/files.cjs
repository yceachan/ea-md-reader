const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { fileURLToPath } = require('node:url');

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdx']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon' };

function fileArguments(argv, cwd) {
  const args = argv.slice(process.defaultApp ? 2 : 1);
  let literal = false;
  return args.flatMap((arg) => {
    if (arg === '--') { literal = true; return []; }
    if (!literal && arg.startsWith('-')) return [];
    return [arg.startsWith('file:') ? fileURLToPath(arg) : path.resolve(cwd, arg)];
  });
}

function documentKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const kind = HTML_EXTENSIONS.has(extension) ? 'html' : 'markdown';
  if (!HTML_EXTENSIONS.has(extension) && !MARKDOWN_EXTENSIONS.has(extension)) throw new Error('请选择 Markdown 或 HTML 文件（.md、.markdown、.mdown、.mkd、.mkdn、.mdx、.html、.htm）。');
  return kind;
}

async function readDocument(filePath) {
  const kind = documentKind(filePath);
  const canonicalPath = await fs.realpath(filePath);
  const bytes = await fs.readFile(canonicalPath);
  // Fail explicitly for non-UTF-8 input instead of silently changing its contents.
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return { id: randomUUID(), kind, path: canonicalPath, name: path.basename(canonicalPath), text, bytes };
}

function publicDocument(document) {
  const { bytes, ...result } = document;
  return document.kind === 'html' ? { ...result, pageUrl: `emd-page://${document.id}/index.html?revision=${randomUUID()}` } : result;
}

async function scanWorkspace(root, activePath) {
  async function scan(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nodes = [];
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const children = await scan(entryPath);
        if (children.length) nodes.push({ name: entry.name, path: entryPath, children });
      } else if (entry.isFile() && (MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || HTML_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))) {
        nodes.push({ name: entry.name, path: entryPath });
      }
    }
    return nodes.sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
  }
  return { root, name: path.basename(root), nodes: await scan(root), activeAncestors: activePath ? workspaceContext(activePath, root).activeAncestors : [] };
}

function isWithin(root, filePath, paths = path) {
  const relative = paths.relative(root, filePath);
  return relative !== '' && !relative.startsWith(`..${paths.sep}`) && relative !== '..' && !paths.isAbsolute(relative);
}

function workspaceContext(filePath, previousRoot, paths = path) {
  const root = previousRoot && isWithin(previousRoot, filePath, paths) ? previousRoot : paths.dirname(filePath);
  const activeAncestors = [];
  let directory = paths.dirname(filePath);
  while (isWithin(root, directory, paths)) {
    activeAncestors.push(directory);
    directory = paths.dirname(directory);
  }
  activeAncestors.push(root);
  return { root, activeAncestors };
}

async function saveDocument(document, destination) {
  const original = await fs.stat(document.path);
  const target = await fs.stat(destination).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (target && original.dev === target.dev && original.ino === target.ino) {
    throw new Error('只读文件不能覆盖自身，请选择另一个位置。');
  }
  // Save the bytes that were opened, including BOM, frontmatter and CRLF.
  await fs.writeFile(destination, document.bytes);
}

module.exports = { fileArguments, documentKind, readDocument, publicDocument, saveDocument, scanWorkspace, isWithin, workspaceContext, IMAGE_TYPES, MARKDOWN_EXTENSIONS, HTML_EXTENSIONS };
