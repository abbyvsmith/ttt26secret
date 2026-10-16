import { useEffect, useState } from 'react';
import { backend, type LeaderboardRow } from '../backend';
import { PERSON_COUNT, PHOTO_COUNT, POINTS } from '../game/tasks';

export function Leaderboard({ myUserId, refreshKey }: { myUserId: string; refreshKey: number }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      backend.getLeaderboard().then(
        (r) => alive && (setRows(r), setError(null)),
        (e) => alive && setError((e as Error).message),
      );
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refreshKey]);

  return (
    <div className="page">
      <h1 className="page-title">leaderboard</h1>
      {error && <p className="form-error">{error}</p>}
      {!rows && !error && <p className="muted">loading…</p>}
      {rows && (
        <ol className="leaderboard">
          {rows.map((r, i) => (
            <li key={r.userId} className={`lb-row${r.userId === myUserId ? ' is-me' : ''}`}>
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-name">
                {r.name}
                {r.userId === myUserId && <span className="lb-you"> (you)</span>}
                <span className="lb-progress">
                  <span className="dot dot-blue" /> {r.personDone}/{PERSON_COUNT}
                  <span className="dot dot-orange" /> {r.photoDone}/{PHOTO_COUNT}
                </span>
              </span>
              <span className="lb-points">{r.points.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}

      <section className="rules">
        <h2>scoring</h2>
        <p><span className="dot dot-blue" /> blue square: {POINTS.person} pts</p>
        <p><span className="dot dot-orange" /> orange photo: {POINTS.photo} pts</p>
        <p>all {PERSON_COUNT} blue: +{POINTS.allPersonBonus.toLocaleString()} bonus</p>
        <p>all {PHOTO_COUNT} orange: +{POINTS.allPhotoBonus.toLocaleString()} bonus</p>
        <p className="muted">tie? whoever reached their score first wins.</p>
      </section>
    </div>
  );
}
