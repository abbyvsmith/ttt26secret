// The 24 bingo tasks. Task ids must match supabase/schema.sql.
//
// `icon` is the tile position (0–24, reading order) in the Figma board whose
// artwork belongs to this task. The artwork follows the task wherever the
// task lands on a player's shuffled board, so a task looks the same for everyone.

export type TaskKind = 'person' | 'photo';

export interface Task {
  id: string;
  kind: TaskKind;
  prompt: string;
  icon: number;
  /** Photo tasks only: short name used for folders in the organizer download. */
  shortName?: string;
  /** Photo tasks only: ask for an extra text answer. */
  textInput?: { label: string; placeholder: string };
}

// Figma positions of each ring (5×5, reading order).
export const OUTER_RING = [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24];
export const INNER_RING = [6, 7, 8, 11, 13, 16, 17, 18];
export const FREE_SPACE = 12;

const PERSON_PROMPTS = [
  'is a night owl',
  'is a morning person',
  'makes their bed every morning',
  'has rewatched the same TV series three or more times',
  'has swum in two different oceans',
  'has been in a helicopter or hot air balloon',
  'has performed on stage',
  'has taken a road trip of more than 1,000 miles',
  'has lived abroad for six months or more',
  'went to a school with fewer than 100 students per grade',
  'has met someone famous',
  'bakes bread from scratch',
  'can juggle or do a magic trick',
  'has a garden or keeps houseplants alive',
  'has run a race (5K or longer)',
  'has gone skydiving, bungee jumping, or ziplining',
];

const PHOTO_TASKS: Omit<Task, 'id' | 'kind' | 'icon'>[] = [
  {
    prompt: 'Recreate a famous album cover with someone',
    shortName: 'Album cover',
    textInput: { label: 'Which album?', placeholder: 'album name' },
  },
  { prompt: 'Make the Viget logo with another person', shortName: 'Viget logo' },
  {
    prompt:
      'You winning a rock paper scissors duel (one shot per duel — if you lose, pick a new opponent!)',
    shortName: 'Rock paper scissors',
  },
  { prompt: 'Any beverage you enjoyed with a teammate', shortName: 'Beverage with a teammate' },
  { prompt: 'A walk or Uber with someone else', shortName: 'Walk or Uber' },
  {
    prompt: "Proof you hung out with someone you don't see in your office",
    shortName: 'Someone from another office',
  },
  {
    prompt: 'You and some teammates at a tourist destination',
    shortName: 'Tourist destination',
  },
  {
    prompt: "You + teammates recreating something you've found in a museum",
    shortName: 'Museum recreation',
  },
];

export const TASKS: Task[] = [
  ...PERSON_PROMPTS.map((p, i) => ({
    id: `person-${String(i + 1).padStart(2, '0')}`,
    kind: 'person' as const,
    prompt: `Find someone who ${p}`,
    icon: OUTER_RING[i],
  })),
  ...PHOTO_TASKS.map((t, i) => ({
    ...t,
    id: `photo-${String(i + 1).padStart(2, '0')}`,
    kind: 'photo' as const,
    icon: INNER_RING[i],
  })),
];

export const TASKS_BY_ID = new Map(TASKS.map((t) => [t.id, t]));

// ---------- Scoring (keep in sync with public.leaderboard() in schema.sql) ----------

export const POINTS = {
  person: 50,
  photo: 200,
  allPersonBonus: 400,
  allPhotoBonus: 1600,
};

export const PERSON_COUNT = PERSON_PROMPTS.length;
export const PHOTO_COUNT = PHOTO_TASKS.length;

export function scoreFor(personDone: number, photoDone: number): number {
  return (
    personDone * POINTS.person +
    photoDone * POINTS.photo +
    (personDone === PERSON_COUNT ? POINTS.allPersonBonus : 0) +
    (photoDone === PHOTO_COUNT ? POINTS.allPhotoBonus : 0)
  );
}

// ---------- Per-player shuffled board ----------

/** Board cell → task id (or 'free'), 25 cells in reading order. */
export function boardFor(seed: string): (string | 'free')[] {
  const rand = mulberry32(hash(seed));
  const outer = shuffle(TASKS.filter((t) => t.kind === 'person').map((t) => t.id), rand);
  const inner = shuffle(TASKS.filter((t) => t.kind === 'photo').map((t) => t.id), rand);
  const cells: (string | 'free')[] = new Array(25);
  OUTER_RING.forEach((pos, i) => (cells[pos] = outer[i]));
  INNER_RING.forEach((pos, i) => (cells[pos] = inner[i]));
  cells[FREE_SPACE] = 'free';
  return cells;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
