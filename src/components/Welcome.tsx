import { useEffect, useState } from 'react';
import { backend, type Me, type Person } from '../backend';
import { ALLOWED_EMAIL_DOMAIN } from '../config';
import { FREE_SPACE } from '../game/tasks';
import { tileUrl } from './art';

function Title() {
  return (
    <div className="welcome-title">
      <div className="board-letters" aria-hidden>
        {'VIGET'.split('').map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <img className="welcome-star" src={tileUrl(FREE_SPACE, true)} alt="" />
      <div className="board-letters" aria-hidden>
        {'BINGO'.split('').map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

export function SignIn({ error }: { error: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(error);
  return (
    <div className="welcome">
      <Title />
      <p className="welcome-copy">sign in with your {ALLOWED_EMAIL_DOMAIN} google account to play.</p>
      {err && <p className="form-error">{err}</p>}
      <button
        className="btn-primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          backend.signIn().catch((e) => {
            setErr((e as Error).message);
            setBusy(false);
          });
        }}
      >
        {busy ? 'opening google…' : 'sign in with google'}
      </button>
      {backend.isDemo && (
        <p className="muted demo-note">demo mode: no supabase keys set, data stays in this browser.</p>
      )}
    </div>
  );
}

export function ClaimName({ people, onClaimed }: { people: Person[]; onClaimed: (me: Me) => void }) {
  const [claimed, setClaimed] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backend.getClaimedPersonIds().then(setClaimed, (e) => setError((e as Error).message));
  }, []);

  async function save() {
    if (selected == null) return;
    setSaving(true);
    setError(null);
    try {
      onClaimed(await backend.claimPerson(selected));
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
      backend.getClaimedPersonIds().then(setClaimed, () => {});
    }
  }

  return (
    <div className="welcome">
      <Title />
      <p className="welcome-copy">which one is you?</p>
      <div className="chips">
        {people.map((p) => {
          const taken = claimed.includes(p.id);
          return (
            <button
              key={p.id}
              className={`chip${selected === p.id ? ' is-selected' : ''}`}
              disabled={taken}
              onClick={() => setSelected(p.id)}
            >
              {p.name}
            </button>
          );
        })}
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="btn-primary" disabled={selected == null || saving} onClick={save}>
        {saving ? 'saving…' : "that's me"}
      </button>
      <button className="btn-link" onClick={() => backend.signOut()}>
        sign out
      </button>
    </div>
  );
}
