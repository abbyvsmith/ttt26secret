import { useCallback, useEffect, useMemo, useState } from 'react';
import { backend, type Completion, type Me, type Person } from './backend';
import { ALLOWED_EMAIL_DOMAIN } from './config';
import { TASKS_BY_ID, boardFor } from './game/tasks';
import { Board } from './components/Board';
import { BottomNav, type Tab } from './components/BottomNav';
import { Leaderboard } from './components/Leaderboard';
import { Organizer } from './components/Organizer';
import { PersonSheet } from './components/PersonSheet';
import { PhotoSheet } from './components/PhotoSheet';
import { TaskList } from './components/TaskList';
import { ClaimName, SetNewPassword, SignIn } from './components/Welcome';

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [tab, setTab] = useState<Tab>('board');
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(
    () =>
      backend.onAuthChange((next, recovery) => {
        if (next && !next.email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
          setAuthError(`Please use your @${ALLOWED_EMAIL_DOMAIN} email.`);
          backend.signOut();
          return;
        }
        if (recovery) setRecovering(true);
        setMe(next);
      }),
    [],
  );

  // Every sign-in starts on the board.
  useEffect(() => {
    setTab('board');
    setShowOrganizer(false);
  }, [me?.userId]);

  useEffect(() => {
    if (!me) return;
    backend.getPeople().then(setPeople, (e) => setLoadError((e as Error).message));
  }, [me?.userId]);

  const reloadCompletions = useCallback(() => {
    backend.getMyCompletions().then(setCompletions, (e) => setLoadError((e as Error).message));
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (me?.personId) reloadCompletions();
  }, [me?.userId, me?.personId, reloadCompletions]);

  const cells = useMemo(() => (me ? boardFor(me.userId) : []), [me?.userId]);
  const byTask = useMemo(() => new Map(completions.map((c) => [c.taskId, c])), [completions]);
  const doneIds = useMemo(() => new Set(byTask.keys()), [byTask]);

  if (me === undefined) return <div className="app-loading" />;
  if (me === null) return <SignIn error={authError} />;
  if (recovering) return <SetNewPassword onDone={() => setRecovering(false)} />;
  if (me.personId == null) return <ClaimName onClaimed={setMe} />;
  if (!people.length && !loadError) return <div className="app-loading" />;

  const openTask = openTaskId ? TASKS_BY_ID.get(openTaskId) : undefined;
  const close = () => setOpenTaskId(null);

  return (
    <div className="app">
      <main className="app-main">
        {loadError && <p className="form-error">{loadError}</p>}
        {showOrganizer && <Organizer onBack={() => setShowOrganizer(false)} />}
        {!showOrganizer && tab === 'board' && (
          <Board cells={cells} done={doneIds} activeTaskId={openTaskId} onOpen={setOpenTaskId} />
        )}
        {!showOrganizer && tab === 'tasks' && (
          <TaskList cells={cells} completions={byTask} people={people} onOpen={setOpenTaskId} />
        )}
        {!showOrganizer && tab === 'leaderboard' && (
          <>
            <Leaderboard myUserId={me.userId} refreshKey={refreshKey} />
            {me.isOrganizer && (
              <button className="btn-outline organizer-link" onClick={() => setShowOrganizer(true)}>
                organizer: see all photos
              </button>
            )}
            <button className="btn-link" onClick={() => backend.signOut()}>
              sign out
            </button>
          </>
        )}
      </main>
      <BottomNav
        tab={tab}
        onChange={(t) => {
          setShowOrganizer(false);
          setTab(t);
        }}
      />

      {openTask?.kind === 'person' && (
        <PersonSheet
          key={openTask.id}
          task={openTask}
          people={people}
          completion={byTask.get(openTask.id)}
          onClose={close}
          onSave={async (personId) => {
            await backend.savePersonAnswer(openTask.id, personId);
            reloadCompletions();
          }}
        />
      )}
      {openTask?.kind === 'photo' && (
        <PhotoSheet
          key={openTask.id}
          task={openTask}
          completion={byTask.get(openTask.id)}
          onClose={close}
          onSave={async (photo, thumb, albumName) => {
            await backend.submitPhoto(openTask.id, photo, thumb, albumName);
            reloadCompletions();
          }}
        />
      )}
    </div>
  );
}
