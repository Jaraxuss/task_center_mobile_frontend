import { useEffect, useState } from 'react';
import { EmptyHint, TaskRow } from '../components';
import { Task } from '../types';

export function TaskGroupSection({
  title,
  description,
  tasks,
  onOpenTask,
  accent,
  defaultCollapsed = false,
  hideWhenEmpty = false,
  variant = 'default',
  collapsed: controlledCollapsed,
  onToggleCollapsed,
  actions,
  taskDescriptionMaxLength,
  countLabel,
  showToggleIcon = true,
}: {
  title: string;
  description?: string;
  tasks: Task[];
  onOpenTask: (task: Task) => void;
  accent: 'danger' | 'warning' | 'brand' | 'plan' | 'muted' | 'success' | 'board';
  defaultCollapsed?: boolean;
  hideWhenEmpty?: boolean;
  variant?: 'default' | 'today' | 'board';
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  actions?: JSX.Element;
  taskDescriptionMaxLength?: number;
  countLabel?: string;
  showToggleIcon?: boolean;
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const collapsed = controlledCollapsed ?? internalCollapsed;

  useEffect(() => {
    if (controlledCollapsed == null) {
      if (!defaultCollapsed) setInternalCollapsed(false);
      else setInternalCollapsed(true);
    }
  }, [defaultCollapsed, controlledCollapsed]);

  if (hideWhenEmpty && tasks.length === 0) return null;

  const toggleCollapsed = () => {
    if (onToggleCollapsed) onToggleCollapsed();
    else setInternalCollapsed((prev) => !prev);
  };

  return (
    <section className={`card-section accent-${accent} ${variant === 'today' ? 'today-group-card' : ''} ${variant === 'board' ? 'board-group-card' : ''}`}>
      <div className={`section-heading ${variant === 'today' ? 'today-group-heading' : ''} ${variant === 'board' ? 'board-group-heading' : ''}`}>
        <button
          type="button"
          className="section-heading-main collapsible-heading"
          onClick={toggleCollapsed}
        >
          <div className="section-heading-copy">
            <div className="today-group-title-row">
              {variant === 'today' && <span className={`today-group-dot today-group-dot-${accent}`}></span>}
              <strong>{title}</strong>
            </div>
            {description ? <span>{description}</span> : variant === 'board' ? null : <span>{tasks.length} 项</span>}
          </div>
        </button>
        <div className="section-heading-side">
          {actions ? <span className="group-actions-inline">{actions}</span> : null}
          <span className={variant === 'board' && !description ? 'section-count-badge section-count-badge-compact' : 'section-count-badge'}>{countLabel || `${tasks.length} 项`}</span>
          {showToggleIcon ? <button type="button" className="section-toggle-icon-button" onClick={toggleCollapsed} aria-label={collapsed ? `展开 ${title}` : `折叠 ${title}`}><span className="section-toggle-icon">{collapsed ? '+' : '−'}</span></button> : null}
        </div>
      </div>
      {!collapsed && (
        <div className="task-list">
          {tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onClick={() => onOpenTask(task)} descriptionMaxLength={variant === 'board' ? taskDescriptionMaxLength : undefined} />) : <EmptyHint label={`暂无${title}`} />}
        </div>
      )}
    </section>
  );
}
