// Demo mode: used when no Supabase keys are configured. Everything is saved in
// this browser's localStorage so the app can be clicked through end to end.
import { TASKS_BY_ID, scoreFor } from '../game/tasks';
import type { Backend, Completion, LeaderboardRow, Me, Person } from './types';

const KEY = 'viget-bingo-demo';
const USER_ID = 'demo-user';

const PEOPLE: Person[] = [
  'Abby', 'Anabel', 'Andrew', 'Blair', 'Jackie', 'Jackson',
  'Jenna', 'Katie', 'KV', 'Liv', 'Owen',
].map((name, i) => ({ id: i + 1, name }));

// Pretend other players, so the leaderboard has something to show.
const OTHERS = [
  { personId: 2, personDone: 9, photoDone: 3, at: '2026-10-16T15:10:00Z' },
  { personId: 7, personDone: 16, photoDone: 2, at: '2026-10-16T16:42:00Z' },
  { personId: 10, personDone: 5, photoDone: 1, at: '2026-10-16T14:05:00Z' },
];

interface State {
  signedIn: boolean;
  account?: { email: string; password: string };
  personId: number | null;
  completions: Omit<Completion, 'photoUrl'>[];
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { signedIn: false, personId: null, completions: [] };
}

function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function createDemoBackend(): Backend {
  let state = load();
  // in-memory only, so photos disappear on reload in demo mode
  const photoUrls = new Map<string, string>();
  const thumbUrls = new Map<string, string>();
  let listener: ((me: Me | null, recovery: boolean) => void) | null = null;

  const me = (): Me | null =>
    state.signedIn
      ? {
          userId: USER_ID,
          email: state.account?.email ?? 'you@viget.com',
          personId: state.personId,
          isOrganizer: true,
        }
      : null;
  const update = (s: State) => {
    state = s;
    save(s);
  };
  const upsert = (c: Omit<Completion, 'photoUrl'>) =>
    update({
      ...state,
      completions: [...state.completions.filter((x) => x.taskId !== c.taskId), c],
    });
  const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

  return {
    isDemo: true,

    onAuthChange(cb) {
      listener = cb;
      setTimeout(() => cb(me(), false), 0);
      return () => (listener = null);
    },

    async signIn(email, password) {
      await delay();
      const a = state.account;
      if (!a || a.email.toLowerCase() !== email.toLowerCase() || a.password !== password) {
        throw new Error('That email and password don’t match.');
      }
      update({ ...state, signedIn: true });
      listener?.(me(), false);
    },

    async signUp(email, password, personId) {
      await delay();
      if (!email.toLowerCase().endsWith('@viget.com')) {
        throw new Error('Please use your @viget.com email.');
      }
      update({ ...state, account: { email, password }, personId, signedIn: true, completions: [] });
      listener?.(me(), false);
      return { needsConfirmation: false };
    },

    async requestPasswordReset() {
      await delay();
    },

    async updatePassword(password) {
      if (state.account) update({ ...state, account: { ...state.account, password } });
      listener?.(me(), false);
    },

    async signOut() {
      update({ ...state, signedIn: false });
      listener?.(null, false);
    },

    async getPeople() {
      return PEOPLE;
    },

    async getSignupPeople() {
      const taken = new Set(OTHERS.map((o) => o.personId));
      return PEOPLE.map((p) => ({ ...p, claimed: taken.has(p.id) }));
    },

    async claimPerson(personId) {
      update({ ...state, personId });
      return me()!;
    },

    async getMyCompletions() {
      return state.completions.map((c) => ({ ...c, photoUrl: photoUrls.get(c.taskId) ?? null }));
    },

    async savePersonAnswer(taskId, personId) {
      await delay();
      upsert({ taskId, personId, albumName: null, completedAt: new Date().toISOString() });
    },

    async submitPhoto(taskId, photo, thumb, albumName) {
      await delay(900);
      photoUrls.set(taskId, URL.createObjectURL(photo));
      thumbUrls.set(taskId, URL.createObjectURL(thumb));
      upsert({ taskId, personId: null, albumName, completedAt: new Date().toISOString() });
    },

    async getLeaderboard() {
      const rows: LeaderboardRow[] = OTHERS.map((o) => ({
        userId: `demo-${o.personId}`,
        name: PEOPLE.find((p) => p.id === o.personId)!.name,
        personDone: o.personDone,
        photoDone: o.photoDone,
        points: scoreFor(o.personDone, o.photoDone),
        lastScoredAt: o.at,
      }));
      if (state.personId) {
        const kinds = state.completions.map((c) => TASKS_BY_ID.get(c.taskId)?.kind);
        const personDone = kinds.filter((k) => k === 'person').length;
        const photoDone = kinds.filter((k) => k === 'photo').length;
        const last = state.completions.map((c) => c.completedAt).sort().at(-1) ?? null;
        rows.push({
          userId: USER_ID,
          name: PEOPLE.find((p) => p.id === state.personId)!.name,
          personDone,
          photoDone,
          points: scoreFor(personDone, photoDone),
          lastScoredAt: last,
        });
      }
      return rows.sort(
        (a, b) =>
          b.points - a.points ||
          (a.lastScoredAt ?? '9').localeCompare(b.lastScoredAt ?? '9') ||
          a.name.localeCompare(b.name),
      );
    },

    async getAllPhotos() {
      const name = PEOPLE.find((p) => p.id === state.personId)?.name ?? 'you';
      return state.completions
        .filter((c) => photoUrls.has(c.taskId))
        .map((c) => ({
          taskId: c.taskId,
          userId: USER_ID,
          playerName: name,
          albumName: c.albumName,
          completedAt: c.completedAt,
          fullUrl: photoUrls.get(c.taskId)!,
          thumbUrl: thumbUrls.get(c.taskId)!,
        }));
    },
  };
}
