import { iconMarkup } from './art';

export function TaskIcon({ icon, size = 30 }: { icon: number; size?: number }) {
  return (
    <span
      className="task-icon"
      style={{ width: size * 0.92, height: size }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: iconMarkup(icon) }}
    />
  );
}
