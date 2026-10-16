import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { backend, type Me, type SignupPerson } from '../backend';
import { ALLOWED_EMAIL_DOMAIN } from '../config';
import { FREE_SPACE } from '../game/tasks';
import { tileUrl } from './art';

const MIN_PASSWORD = 6;

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

/** Shared form wrapper: runs `action`, shows its error, disables while busy. */
function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, onSubmit };
}

function NamePicker({
  people,
  selected,
  onSelect,
}: {
  people: SignupPerson[] | null;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  if (!people) return <p className="muted">loading names…</p>;
  return (
    <div className="chips" role="radiogroup" aria-label="Your name">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={selected === p.id}
          className={`chip${selected === p.id ? ' is-selected' : ''}`}
          disabled={p.claimed}
          onClick={() => onSelect(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

function useSignupPeople() {
  const [people, setPeople] = useState<SignupPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => backend.getSignupPeople().then(setPeople, (e) => setError((e as Error).message));
  useEffect(() => {
    reload();
  }, []);
  return { people, error, reload };
}

function Field(props: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  hint?: ReactNode;
}) {
  return (
    <label className="text-field">
      <span>{props.label}</span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        required
        autoCapitalize="none"
      />
      {props.hint && <small className="muted">{props.hint}</small>}
    </label>
  );
}

type Mode = 'signup' | 'signin' | 'forgot';

export function SignIn({ error: initialError }: { error: string | null }) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [personId, setPersonId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const signup = useSignupPeople();

  const submit = useSubmit(async () => {
    setNotice(null);
    if (mode === 'signin') {
      await backend.signIn(email.trim(), password);
    } else if (mode === 'forgot') {
      await backend.requestPasswordReset(email.trim());
      setNotice('If that email has an account, a reset link is on its way.');
    } else {
      if (personId == null) throw new Error('Pick your name.');
      try {
        const { needsConfirmation } = await backend.signUp(email.trim(), password, personId);
        if (needsConfirmation) {
          setNotice('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      } catch (e) {
        signup.reload();
        throw e;
      }
    }
  });

  const switchTo = (m: Mode) => {
    setMode(m);
    setNotice(null);
    submit.setError(null);
  };

  return (
    <div className="welcome">
      <form className="auth-form" onSubmit={submit.onSubmit}>
        <p className="welcome-copy">
          {mode === 'signup' && 'create your account'}
          {mode === 'signin' && 'welcome back'}
          {mode === 'forgot' && 'reset your password'}
        </p>

        <Field
          label="email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete={mode === 'signup' ? 'email' : 'username'}
          placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
        />

        {mode !== 'forgot' && (
          <Field
            label="password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            hint={mode === 'signup' ? `at least ${MIN_PASSWORD} characters` : undefined}
          />
        )}

        {mode === 'signup' && (
          <div className="text-field">
            <span>which one is you?</span>
            <NamePicker people={signup.people} selected={personId} onSelect={setPersonId} />
            {signup.error && <p className="form-error">{signup.error}</p>}
          </div>
        )}

        {(submit.error ?? (mode === 'signin' && initialError)) && (
          <p className="form-error">{submit.error ?? initialError}</p>
        )}
        {notice && <p className="form-notice">{notice}</p>}

        <button
          className="btn-primary"
          disabled={
            submit.busy ||
            (mode === 'signup' && (personId == null || password.length < MIN_PASSWORD))
          }
        >
          {submit.busy
            ? 'one sec…'
            : mode === 'signup'
              ? 'start playing'
              : mode === 'signin'
                ? 'sign in'
                : 'send reset link'}
        </button>
      </form>

      <div className="auth-links">
        {mode === 'signup' ? (
          <button className="btn-link" onClick={() => switchTo('signin')}>
            already have an account? sign in
          </button>
        ) : (
          <button className="btn-link" onClick={() => switchTo('signup')}>
            new here? create an account
          </button>
        )}
        {mode === 'signin' && (
          <button className="btn-link" onClick={() => switchTo('forgot')}>
            forgot password?
          </button>
        )}
      </div>

      {backend.isDemo && (
        <p className="muted demo-note">demo mode: no supabase keys set, data stays in this browser.</p>
      )}
    </div>
  );
}

/** Shown after following a password-reset email link. */
export function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const submit = useSubmit(async () => {
    await backend.updatePassword(password);
    onDone();
  });
  return (
    <div className="welcome">
      <Title />
      <form className="auth-form" onSubmit={submit.onSubmit}>
        <p className="welcome-copy">choose a new password</p>
        <Field
          label="new password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={`at least ${MIN_PASSWORD} characters`}
        />
        {submit.error && <p className="form-error">{submit.error}</p>}
        <button className="btn-primary" disabled={submit.busy || password.length < MIN_PASSWORD}>
          {submit.busy ? 'saving…' : 'save password'}
        </button>
      </form>
    </div>
  );
}

/** Fallback for accounts without a name yet (e.g. created with email confirmation on). */
export function ClaimName({ onClaimed }: { onClaimed: (me: Me) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const signup = useSignupPeople();
  const submit = useSubmit(async () => {
    if (selected == null) return;
    try {
      onClaimed(await backend.claimPerson(selected));
    } catch (e) {
      signup.reload();
      throw e;
    }
  });

  return (
    <div className="welcome">
      <Title />
      <form className="auth-form" onSubmit={submit.onSubmit}>
        <p className="welcome-copy">which one is you?</p>
        <NamePicker people={signup.people} selected={selected} onSelect={setSelected} />
        {(submit.error ?? signup.error) && <p className="form-error">{submit.error ?? signup.error}</p>}
        <button className="btn-primary" disabled={selected == null || submit.busy}>
          {submit.busy ? 'saving…' : "that's me"}
        </button>
      </form>
      <button className="btn-link" onClick={() => backend.signOut()}>
        sign out
      </button>
    </div>
  );
}
