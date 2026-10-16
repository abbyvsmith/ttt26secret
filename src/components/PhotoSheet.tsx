import { useEffect, useRef, useState } from 'react';
import type { Completion } from '../backend';
import type { Task } from '../game/tasks';
import { compressImage } from '../lib/compressImage';
import paperclip from '../assets/figma/ui/paperclip.svg';
import { Sheet } from './Sheet';
import { TaskIcon } from './TaskIcon';

interface Props {
  task: Task;
  completion: Completion | undefined;
  onSave: (photo: Blob, albumName: string | null) => Promise<void>;
  onClose: () => void;
}

export function PhotoSheet({ task, completion, onSave, onClose }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(completion?.photoUrl ?? null);
  const [text, setText] = useState(completion?.albumName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const needsText = !!task.textInput;
  const canSave = !!file && (!needsText || text.trim().length > 0) && !saving;

  async function save() {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const photo = await compressImage(file);
      await onSave(photo, needsText ? text.trim() : null);
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

      {preview && (
        <div className="photo-preview">
          <img src={preview} alt="Your photo" />
          {completion && !file && <span className="photo-preview-note">✓ submitted</span>}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setFile(f);
          e.target.value = '';
        }}
      />
      <button className="btn-outline" onClick={() => fileInput.current?.click()}>
        <img src={paperclip} alt="" width={24} height={24} />
        {preview ? 'replace your photo' : 'attach your photo'}
      </button>

      {task.textInput && (
        <label className="text-field">
          <span>{task.textInput.label}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={task.textInput.placeholder}
            maxLength={120}
          />
        </label>
      )}

      {error && <p className="form-error">{error}</p>}
      <button className="btn-primary" disabled={!canSave} onClick={save}>
        {saving ? 'uploading…' : 'save'}
      </button>
    </Sheet>
  );
}
