import type { Completion, Person } from '../backend';
import { FREE_SPACE, TASKS_BY_ID } from '../game/tasks';
import { TaskIcon } from './TaskIcon';

interface Props {
  cells: (string | 'free')[];
  completions: Map<string, Completion>;
  people: Person[];
  onOpen: (taskId: string) => void;
}

export function TaskList({ cells, completions, people, onOpen }: Props) {
  return (
    <div className="page">
      <h1 className="page-title">task list</h1>
      <div className="task-list">
        {cells.map((cell) => {
          if (cell === 'free') {
            return (
              <div key="free" className="task-card task-card-free" aria-label="Free space">
                <TaskIcon icon={FREE_SPACE} size={28} />
              </div>
            );
          }
          const task = TASKS_BY_ID.get(cell)!;
          const c = completions.get(cell);
          const answer = !c
            ? null
            : task.kind === 'person'
              ? people.find((p) => p.id === c.personId)?.name
              : c.albumName
                ? `photo added · ${c.albumName}`
                : 'photo added';
          return (
            <button
              key={cell}
              className={`task-card task-card-${task.kind}${c ? ' is-done' : ''}`}
              onClick={() => onOpen(cell)}
            >
              <TaskIcon icon={task.icon} />
              <span className="task-card-text">
                {task.prompt}
                {answer && <span className="task-card-answer">✓ {answer}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
