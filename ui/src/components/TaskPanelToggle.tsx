import { useCallback, useState } from "react";
import { strings } from "../strings";
import { Icon } from "./Icon";

export const TASK_PANEL_KEY = "sim.taskPanel";

function loadCollapsed(): boolean {
  try {
    return window.sessionStorage.getItem(TASK_PANEL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) window.sessionStorage.setItem(TASK_PANEL_KEY, "collapsed");
    else window.sessionStorage.removeItem(TASK_PANEL_KEY);
  } catch {}
}

export function useTaskPanelCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const update = useCallback((next: boolean) => {
    setCollapsed(next);
    saveCollapsed(next);
  }, []);
  return [collapsed, update];
}

interface TaskPanelToggleProps {
  panelId: string;
  collapsed: boolean;
  onToggle: () => void;
  position: number;
  total: number;
}

export function TaskPanelToggle({
  panelId,
  collapsed,
  onToggle,
  position,
  total,
}: TaskPanelToggleProps) {
  const showPosition = collapsed && position > 0 && total > 0;

  return (
    <div className="task-strip">
      <button
        type="button"
        className="task-strip-toggle"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <Icon name="panel" className="task-strip-icon" />
        <span>{collapsed ? strings.exam.tasksShow : strings.exam.tasksHide}</span>
        {showPosition && (
          <span className="task-strip-position">
            <span className="sr-only">, </span>
            {strings.exam.tasksPosition(position, total)}
          </span>
        )}
      </button>
    </div>
  );
}
