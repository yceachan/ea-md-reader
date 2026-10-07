import { useEffect, useRef, useState } from 'react';
import mediumZoom from 'medium-zoom';
import { renderMarkdown, splitFrontmatter, type RenderResult } from '../lib/markdown';

let mermaidQueue = Promise.resolve();
function diagramJob(job: () => Promise<void>) {
  const next = mermaidQueue.then(job);
  mermaidQueue = next.catch(() => {}); // A failed diagram must not block other tabs.
  return next;
}

export default function Article({ document, active, anchor, onHeadings, onError }: {
  document: ReaderDocument; active: boolean; anchor: string | null;
  onHeadings: (id: string, headings: RenderResult['headings']) => void;
  onError: (message: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingsCallback = useRef(onHeadings);
  headingsCallback.current = onHeadings;

  useEffect(() => {
    let canceled = false;
    setResult(null); setError(null);
    headingsCallback.current(document.id, []);
    renderMarkdown(document.text).then((rendered) => {
      if (canceled) return;
      setResult(rendered);
      headingsCallback.current(document.id, rendered.headings);
    }).catch((error: Error) => { if (!canceled) setError(error.message); });
    return () => { canceled = true; };
  }, [document.id, document.path, document.text]);

  useEffect(() => {
    const container = element.current;
    if (!container || !result) return;
    let canceled = false;
    const template = window.document.createElement('template');
    template.innerHTML = result.html;
    template.content.querySelectorAll<HTMLInputElement>('input').forEach((input) => { input.disabled = true; });
    template.content.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
      const src = image.getAttribute('src');
      const fail = (reason = '图片无法读取') => {
        const caption = window.document.createElement('span');
        caption.className = 'broken-image';
        caption.textContent = `${reason}：${image.alt || src}`;
        image.replaceWith(caption);
      };
      image.addEventListener('error', () => fail(), { once: true });
      if (src && !/^(https?:|data:)/i.test(src)) {
        try {
          const asset = decodeURIComponent(src.split(/[?#]/)[0]);
          image.src = `emd-asset://${document.id}/${encodeURIComponent(asset)}`;
        } catch (error) { fail(`图片路径无效（${(error as Error).message}）`); }
      }
    });
    container.replaceChildren(template.content);
    const zoom = mediumZoom(container.querySelectorAll('img'), { background: 'var(--kb-surface)', margin: 32 });
    const nodes = [...container.querySelectorAll<HTMLElement>('.mermaid')];
    if (nodes.length) {
      diagramJob(async () => {
        const { default: mermaid } = await import('mermaid');
        if (canceled) return;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', fontFamily: 'system-ui', suppressErrorRendering: true });
        for (let index = 0; index < nodes.length; index++) {
          if (canceled) return;
          const node = nodes[index];
          const source = node.textContent!;
          try {
            const { svg } = await mermaid.render(`diagram-${document.id}-${index}-${Date.now()}`, source);
            if (canceled) return;
            node.innerHTML = svg;
            const diagram = node.querySelector('svg')!;
            diagram.style.width = `${Math.max(diagram.viewBox.baseVal.width, 900)}px`;
            diagram.style.maxWidth = 'none';
            diagram.style.height = 'auto';
          } catch (error) {
            if (canceled) return;
            node.classList.add('mermaid-error');
            node.textContent = `图表解析失败：${(error as Error).message}\n\n${source}`;
          }
        }
      }).catch((error: Error) => { if (!canceled) onError(`图表渲染失败：${error.message}`); });
    }
    return () => { canceled = true; zoom.detach(); };
  }, [result, document.id, document.path]);

  useEffect(() => {
    if (active && anchor && result) {
      element.current?.querySelectorAll<HTMLElement>('[id]').forEach((heading) => {
        if (heading.id === anchor) heading.scrollIntoView({ block: 'start' });
      });
    }
  }, [active, anchor, result]);

  const { frontmatter } = splitFrontmatter(document.text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  return <>
    {error && <div className="render-error" role="alert">渲染失败：{error}</div>}
    {!result && !error && <p className="loading">正在排版…</p>}
    {result && frontmatter && <details className="frontmatter-block"><summary>文档属性</summary><pre>{frontmatter}</pre></details>}
    <div ref={element} className="vp-doc" onClick={(event) => {
      const link = (event.target as Element).closest('a');
      if (!link) return;
      event.preventDefault();
      const href = link.getAttribute('href');
      if (!href) return;
      if (href.startsWith('#')) {
        const id = decodeURIComponent(href.slice(1));
        element.current?.querySelectorAll<HTMLElement>('[id]').forEach((heading) => {
          if (heading.id === id) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else { void window.emd.link(document.id, href); }
    }} />
  </>;
}
