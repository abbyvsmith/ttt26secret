import { FREE_SPACE, TASKS_BY_ID } from '../game/tasks';
import { tileUrl } from './art';

interface Props {
  cells: (string | 'free')[];
  done: Set<string>;
  activeTaskId: string | null;
  onOpen: (taskId: string) => void;
}

export function Board({ cells, done, activeTaskId, onOpen }: Props) {
  return (
    <div className="board">
      <div className="board-letters" aria-hidden>
        {'BINGO'.split('').map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="board-grid">
        {cells.map((cell, i) => {
          if (cell === 'free') {
            return (
              <div key={i} className="tile" aria-label="Free space">
                <img src={tileUrl(FREE_SPACE, true)} alt="" />
              </div>
            );
          }
          const task = TASKS_BY_ID.get(cell)!;
          const isDone = done.has(cell);
          return (
            <button
              key={i}
              className={`tile${activeTaskId === cell ? ' tile-active' : ''}`}
              onClick={() => onOpen(cell)}
              aria-label={`${task.prompt}${isDone ? ' (done)' : ''}`}
            >
              <img src={tileUrl(task.icon, isDone)} alt="" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
