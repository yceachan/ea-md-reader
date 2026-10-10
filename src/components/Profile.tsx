import { useEffect, useRef, useState } from 'react';

export default function Profile({ onClose, error }: { onClose: () => void; error?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  function close() { dialog.current?.close(); onClose(); }
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    let canceled = false;
    void window.emd.profile().then((value) => { if (!canceled) { setProfile(value); setLoading(false); } });
    return () => { canceled = true; element.close(); };
  }, []);
  const link = (target: 'email' | 'github' | 'repository') => (event: React.MouseEvent) => {
    event.preventDefault(); void window.emd.profileLink(target);
  };
  return <dialog ref={dialog} className="profile-dialog" aria-label="个人资料" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="profile-card">
      <button className="profile-close" aria-label="关闭个人资料" onClick={close}>×</button>
      {error && <p className="settings-error" role="alert">{error}</p>}
      {loading && <p role="status">正在读取资料…</p>}
      {profile && <>
        <img className="profile-photo" src={profile.photoUrl} alt={`${profile.name} 的头像`} />
        <h2>{profile.name}</h2><p className="profile-tagline">{profile.tagline}</p>
        <nav className="profile-links" aria-label="个人资料导航">
          <a href={`mailto:${profile.email}`} onClick={link('email')}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg><span>{profile.email}</span></a>
          <a href={profile.github} onClick={link('github')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 1-4-2-6-2m6 5v-3c0-1 .2-2 .8-2.5-3.2-.4-6.5-1.6-6.5-7.1 0-1.5.5-2.7 1.4-3.6-.1-.4-.6-1.8.1-3.5 0 0 1.2-.4 3.7 1.4a12 12 0 0 1 6.8 0c2.5-1.8 3.7-1.4 3.7-1.4.7 1.7.2 3.1.1 3.5.9.9 1.4 2.1 1.4 3.6 0 5.5-3.3 6.7-6.5 7.1.6.5 1 1.5 1 2.5v3" /></svg><span>{profile.github.replace(/^https?:\/\//, '')}</span></a>
          <a href={profile.repository} onClick={link('repository')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg><span>{new URL(profile.repository).pathname.replace(/^\/|\/$/g, '')}</span></a>
        </nav>
        <footer className="profile-footer"><p>{profile.copyright}</p><p className="profile-license"><span>{profile.license}</span></p></footer>
      </>}
    </section>
  </dialog>;
}
