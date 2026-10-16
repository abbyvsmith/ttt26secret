import { useEffect, useState } from 'react';
import { zip } from 'fflate';
import { backend, type SubmittedPhoto } from '../backend';
import { TASKS } from '../game/tasks';
import { TaskIcon } from './TaskIcon';

const PHOTO_TASKS = TASKS.filter((t) => t.kind === 'photo');

export function Organizer({ onBack }: { onBack: () => void }) {
  const [photos, setPhotos] = useState<SubmittedPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [download, setDownload] = useState<string | null>(null);

  useEffect(() => {
    backend.getAllPhotos().then(setPhotos, (e) => setError((e as Error).message));
  }, []);

  async function downloadAll() {
    if (!photos?.length) return;
    setError(null);
    try {
      const files: Record<string, Uint8Array> = {};
      for (const [i, p] of photos.entries()) {
        setDownload(`downloading ${i + 1} of ${photos.length}…`);
        const res = await fetch(p.fullUrl);
        if (!res.ok) throw new Error(`Could not download ${p.playerName}'s photo.`);
        files[zipPath(p, files)] = new Uint8Array(await res.arrayBuffer());
      }
      setDownload('zipping…');
      const data = await new Promise<Uint8Array>((resolve, reject) =>
        zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out))),
      );
      saveBlob(new Blob([data], { type: 'application/zip' }), 'viget-bingo-photos.zip');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownload(null);
    }
  }

  return (
    <div className="page">
      <button className="btn-link back-link" onClick={onBack}>
        ← back
      </button>
      <h1 className="page-title">organizer</h1>
      {error && <p className="form-error">{error}</p>}
      {!photos && !error && <p className="muted">loading…</p>}

      {photos && (
        <>
          <button
            className="btn-primary organizer-download"
            disabled={!photos.length || !!download}
            onClick={downloadAll}
          >
            {download ?? `download all photos (${photos.length})`}
          </button>

          {PHOTO_TASKS.map((task) => {
            const forTask = photos.filter((p) => p.taskId === task.id);
            return (
              <section key={task.id} className="organizer-task">
                <div className="organizer-task-heading">
                  <TaskIcon icon={task.icon} size={26} />
                  <h2>{task.shortName}</h2>
                  <span className="muted">{forTask.length}</span>
                </div>
                {forTask.length === 0 ? (
                  <p className="muted organizer-empty">no photos yet</p>
                ) : (
                  <div className="organizer-grid">
                    {forTask.map((p) => (
                      <a
                        key={p.userId}
                        className="organizer-photo"
                        href={p.fullUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={p.thumbUrl} alt={`${p.playerName}: ${task.shortName}`} loading="lazy" />
                        <span className="organizer-caption">
                          {p.playerName}
                          {p.albumName && <span className="organizer-album">{p.albumName}</span>}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/** e.g. "01 Album cover/Abby – Abbey Road.jpg" */
function zipPath(p: SubmittedPhoto, existing: Record<string, unknown>): string {
  const index = PHOTO_TASKS.findIndex((t) => t.id === p.taskId);
  const task = PHOTO_TASKS[index];
  const folder = `${String(index + 1).padStart(2, '0')} ${task?.shortName ?? p.taskId}`;
  const base = clean([p.playerName, p.albumName].filter(Boolean).join(' – '));
  let path = `${folder}/${base}.jpg`;
  for (let n = 2; path in existing; n++) path = `${folder}/${base} (${n}).jpg`;
  return path;
}

const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim();

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
