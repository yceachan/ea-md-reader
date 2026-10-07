import { useEffect, useRef, useState } from 'react';

export default function Settings({ onClose, onChanged, error }: { onClose: () => void; onChanged: () => void; error?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    let canceled = false;
    void window.emd.settings().then((value) => { if (!canceled) { setSettings(value); setLoading(false); } });
    return () => { canceled = true; element.close(); };
  }, []);
  async function change(kind: EditorKind, clear: boolean) {
    setBusy(true);
    try {
      const value = await (clear ? window.emd.clearEditor(kind) : window.emd.chooseEditor(kind));
      if (value) { if (value.editors[kind]?.program !== settings?.editors[kind]?.program) onChanged(); setSettings(value); }
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-content">
      <header><h2 id="settings-title">设置</h2><button aria-label="关闭设置" className="settings-close" onClick={onClose}>×</button></header>
      {error && <p className="settings-error" role="alert">{error}</p>}
      {loading && <p role="status">正在读取设置…</p>}
      {settings && (['markdown', 'html'] as const).map((kind) => <div className="editor-setting" key={kind}>
        <label>{kind === 'markdown' ? 'Markdown 编辑器' : 'HTML 编辑器'}</label>
        <div className="editor-choice"><span title={settings.editors[kind]?.program}>{settings.editors[kind]?.program ?? '未配置'}</span>
          <button disabled={busy} onClick={() => { void change(kind, false); }}>选择程序…</button>
          {settings.editors[kind] && <button disabled={busy} aria-label={`清除 ${kind === 'markdown' ? 'Markdown' : 'HTML'} 编辑器`} onClick={() => { void change(kind, true); }}>清除</button>}
        </div>
      </div>)}
      <footer><button onClick={onClose}>完成</button></footer>
    </section>
  </dialog>;
}
