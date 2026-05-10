import { getTaskScheduleAt, truncateText } from '../lib';
import { Task } from '../types';
import { describeRecurrence, formatDateTime } from '../utils';
import { StatusPill } from './StatusPills';

export function TaskRow({
  task,
  onClick,
  showUpdated = false,
  descriptionMaxLength,
}: {
  task: Task;
  onClick: () => void;
  showUpdated?: boolean;
  descriptionMaxLength?: number;
}) {
  return (
    <button type="button" className="task-row task-row-button" onClick={onClick}>
      <div className="task-row-main">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <StatusPill status={task.status} />
          <span className="task-meta-time">{formatDateTime(getTaskScheduleAt(task))}</span>
          {task.project && <span className="project-pill">{task.project}</span>}
          {task.recurrence?.enabled && <span className="inline-badge">{describeRecurrence(task.recurrence)}</span>}
        </div>
        {task.description && <div className="task-desc">{truncateText(task.description, descriptionMaxLength)}</div>}
      </div>
      <div className="task-row-tail">{showUpdated ? formatDateTime(task.updated_at) : '›'}</div>
    </button>
  );
}
