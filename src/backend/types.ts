export interface Person {
  id: number;
  name: string;
}

export interface SignupPerson extends Person {
  claimed: boolean;
}

export interface Me {
  userId: string;
  email: string;
  /** null until the player picks their name from the list */
  personId: number | null;
  /** Can open the organizer page */
  isOrganizer: boolean;
}

/** A photo as seen on the organizer page */
export interface SubmittedPhoto {
  taskId: string;
  userId: string;
  playerName: string;
  albumName: string | null;
  completedAt: string;
  thumbUrl: string;
  fullUrl: string;
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
  bingos: number;
  points: number;
  lastScoredAt: string | null;
}

export interface Backend {
  isDemo: boolean;
  /**
   * Resolves the signed-in user (or null) and calls back on sign-in/out.
   * `recovery` is true when the user arrived from a password-reset email.
   */
  onAuthChange(cb: (me: Me | null, recovery: boolean) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /** Creates the account and links it to a name on the people list. */
  signUp(email: string, password: string, personId: number): Promise<{ needsConfirmation: boolean }>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  getPeople(): Promise<Person[]>;
  /** The people list as seen before signing in, with taken names marked. */
  getSignupPeople(): Promise<SignupPerson[]>;
  claimPerson(personId: number): Promise<Me>;
  getMyCompletions(): Promise<Completion[]>;
  savePersonAnswer(taskId: string, personId: number): Promise<void>;
  submitPhoto(taskId: string, photo: Blob, thumb: Blob, albumName: string | null): Promise<void>;
  getLeaderboard(): Promise<LeaderboardRow[]>;
  /** Organizers only: every submitted photo */
  getAllPhotos(): Promise<SubmittedPhoto[]>;
}
