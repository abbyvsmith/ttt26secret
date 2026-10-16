import { useState } from 'react';
import type { Completion, Person } from '../backend';
import type { Task } from '../game/tasks';
import { Sheet } from './Sheet';
import { TaskIcon } from './TaskIcon';

interface Props {
  task: Task;
  people: Person[];
  completion: Completion | undefined;
  onSave: (personId: number) => Promise<void>;
  onClose: () => void;
}

export function PersonSheet({ task, people, completion, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<number | null>(completion?.personId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unchanged = selected === (completion?.personId ?? null);

  async function save() {
    if (selected == null) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(selected);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-heading">
        <TaskIcon icon={task.icon} />
        <p>{task.prompt}</p>
      </div>
      <div className="chips" role="radiogroup" aria-label="Pick a person">
        {people.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={selected === p.id}
            className={`chip${selected === p.id ? ' is-selected' : ''}`}
            onClick={() => setSelected(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="btn-primary" disabled={selected == null || unchanged || saving} onClick={save}>
        {saving ? 'saving…' : 'save'}
      </button>
    </Sheet>
  );
}
