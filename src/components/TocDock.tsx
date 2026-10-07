export default function TocDock({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const label = `${expanded ? '折叠' : '展开'}目录面板`;
  return <button className="toc-dock" aria-label={label} title={label} aria-expanded={expanded} onClick={onToggle}>
    <svg className="toc-dock-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect className="toc-dock-page" x="3" y="3" width="18" height="18" rx="3" />
      <path className="toc-dock-spine" d="M8 3v18" />
      <path className="toc-dock-lines" d="M11 8h6M11 12h6M11 16h4" />
    </svg>
    <span className="toc-dock-label" aria-hidden="true">TOC</span>
    <svg className="toc-dock-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d={expanded ? 'm6 4 4 4-4 4' : 'm10 4-4 4 4 4'} /></svg>
  </button>;
}
