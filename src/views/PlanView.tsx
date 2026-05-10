import { EmptyHint, TaskRow } from '../components';
import { PlanGroup, Task } from '../types';
import { formatDateLabel } from '../utils';

export function PlanHero({ groups }: { groups: PlanGroup[] }) {
  const datedGroups = groups.filter((group) => group.group_date);
  const nextGroup = datedGroups[0];
  const plannedCount = groups.reduce((sum, group) => sum + group.tasks.length, 0);
  const unscheduledCount = groups.find((group) => group.key === 'unscheduled')?.tasks.length || 0;

  return (
    <section className="today-hero card-section accent-brand-soft">
      <div className="today-hero-main">
        <div className="today-hero-heading">
          <span className="topbar-kicker today-hero-kicker">计划节奏</span>
          <h2>{nextGroup ? `${nextGroup.title} · ${nextGroup.tasks.length} 项` : '计划已经排得很空'}</h2>
          <p>
            {nextGroup
              ? '先看后面几天怎么排，再决定今天要不要提前动手。'
              : '临时想到事，先记进来，时间后面再补。'}
          </p>
        </div>
      </div>
      <div className="today-priority-strip" aria-label="计划统计">
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">计划总数</span>
          <strong>{plannedCount}</strong>
        </span>
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">未排期</span>
          <strong>{unscheduledCount}</strong>
        </span>
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">日期组</span>
          <strong>{datedGroups.length}</strong>
        </span>
      </div>
    </section>
  );
}

export function PlanDaySection({ group, onOpenTask, index = 0 }: { group: PlanGroup; onOpenTask: (task: Task) => void; index?: number }) {
  const description = group.group_date
    ? index === 0
      ? '离现在最近的一组，优先看这里。'
      : '按日期顺序排布，适合提前看后面的安排。'
    : '这些任务还没有具体时间，别让它们长期漂着。';
  const accent: 'plan' | 'muted' = group.group_date && index === 0 ? 'plan' : 'muted';

  return (
    <section className={`card-section agenda-section accent-${accent}`}>
      <div className="section-heading">
        <div className="section-heading-copy">
          <strong>{group.title || formatDateLabel(group.group_date)}</strong>
          <span>{description}</span>
        </div>
        <div className="section-heading-side">
          <span className="section-count-badge">{group.tasks.length} 项</span>
        </div>
      </div>
      <div className="task-list">
        {group.tasks.length ? group.tasks.map((task) => <TaskRow key={task.id} task={task} onClick={() => onOpenTask(task)} />) : <EmptyHint label="当天暂无任务" />}
      </div>
    </section>
  );
}
