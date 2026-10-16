export interface Person {
  id: number;
  name: string;
}

export interface Me {
  userId: string;
  email: string;
  /** null until the player picks their name from the list */
  personId: number | null;
}

export interface Completion {
  taskId: string;
  personId: number | null;
  albumName: string | null;
  /** Short-lived URL to the player's own photo, if any */
  photoUrl: string | null;
  completedAt: string;
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  personDone: number;
  photoDone: number;
  points: number;
  lastScoredAt: string | null;
}

export interface Backend {
  isDemo: boolean;
  /** Resolves the signed-in user (or null) and calls back on sign-in/out. */
  onAuthChange(cb: (me: Me | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getPeople(): Promise<Person[]>;
  /** Person ids already taken by other players */
  getClaimedPersonIds(): Promise<number[]>;
  claimPerson(personId: number): Promise<Me>;
  getMyCompletions(): Promise<Completion[]>;
  savePersonAnswer(taskId: string, personId: number): Promise<void>;
  submitPhoto(taskId: string, photo: Blob, albumName: string | null): Promise<void>;
  getLeaderboard(): Promise<LeaderboardRow[]>;
}
