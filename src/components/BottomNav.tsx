// Icons from the Figma "icons" section: outlined normally, filled when the tab is selected.
import boardIcon from '../assets/figma/ui/nav-board.svg';
import boardIconFilled from '../assets/figma/ui/nav-board-filled.svg';
import tasksIcon from '../assets/figma/ui/nav-tasks.svg';
import tasksIconFilled from '../assets/figma/ui/nav-tasks-filled.svg';
import leaderboardIcon from '../assets/figma/ui/nav-leaderboard.svg';
import leaderboardIconFilled from '../assets/figma/ui/nav-leaderboard-filled.svg';

export type Tab = 'board' | 'tasks' | 'leaderboard';

const TABS: { id: Tab; label: string; icon: string; activeIcon: string }[] = [
  { id: 'board', label: 'bingo board', icon: boardIcon, activeIcon: boardIconFilled },
  { id: 'tasks', label: 'task list', icon: tasksIcon, activeIcon: tasksIconFilled },
  {
    id: 'leaderboard',
    label: 'leaderboard',
    icon: leaderboardIcon,
    activeIcon: leaderboardIconFilled,
  },
];

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            className={`nav-item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(t.id)}
          >
            <span className="nav-icon">
              <img src={active ? t.activeIcon : t.icon} alt="" />
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
