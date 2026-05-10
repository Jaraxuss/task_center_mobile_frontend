import { getTaskScheduleAt } from '../lib';
import { StatusPill } from '../components';
import { DashboardToday, Task } from '../types';
import { formatDateTime, groupTodayTasks } from '../utils';

export function SummaryStrip({ summary, compact = false }: { summary?: DashboardToday['summary']; compact?: boolean }) {
  return (
    <section className={compact ? 'summary-strip summary-strip-compact' : 'summary-strip'}>
      <span>今天 {summary?.dueToday || 0} 项</span>
      <span>逾期 {summary?.overdue || 0}</span>
      <span>已完成 {summary?.completed || 0}</span>
    </section>
  );
}

export function TodayHero({
  summary,
  groups,
  onCreateTask,
  onOpenPlan,
  onOpenTask,
}: {
  summary?: DashboardToday['summary'];
  groups: ReturnType<typeof groupTodayTasks>;
  onCreateTask: () => void;
  onOpenPlan: () => void;
  onOpenTask: (task: Task) => void;
}) {
  const overdueCount = groups.overdue.length;
  const dueTodayCount = groups.dueToday.length;
  const laterCount = groups.later.length;
  const completedCount = groups.completed.length;
  const openCount = summary?.open ?? overdueCount + dueTodayCount + laterCount;
  const primaryTask = groups.overdue[0] || groups.dueToday[0] || groups.later[0] || null;
  const queueText = [
    overdueCount > 0 ? `${overdueCount} 项逾期` : null,
    dueTodayCount > 0 ? `${dueTodayCount} 项今天到期` : null,
    laterCount > 0 ? `${laterCount} 项稍后处理` : null,
  ].filter(Boolean).join(' · ');

  const heroCopy = overdueCount > 0
    ? {
        kicker: '先处理风险项',
        title: `${overdueCount} 项逾期任务待收口`,
        description: `先把已经过点的事处理掉。当前未完成 ${openCount} 项，别让后面的安排继续被带偏。`,
      }
    : dueTodayCount > 0
      ? {
          kicker: '今天优先级',
          title: `今天还有 ${dueTodayCount} 项要收口`,
          description: `今天到期的任务已经浮上来了。当前未完成 ${openCount} 项，优先清掉再排后面的活。`,
        }
      : laterCount > 0
        ? {
            kicker: '今天节奏',
            title: `还有 ${laterCount} 项稍后处理`,
            description: `今天没有明显爆点，当前未完成 ${openCount} 项，适合按顺序稳稳推进。`,
          }
        : completedCount > 0
          ? {
              kicker: '今天有产出',
              title: `已经完成 ${completedCount} 项`,
              description: '当前没有挂在眼前的待办，今天的收口进度是正向的。',
            }
          : {
              kicker: '今天很干净',
              title: '目前没有待处理任务',
              description: '如果突然想到新任务，现在就是最适合补进去的时候。',
            };

  return (
    <section className="today-hero card-section accent-brand-soft">
      <div className="today-hero-main">
        <div className="today-hero-heading">
          <span className="topbar-kicker today-hero-kicker">{heroCopy.kicker}</span>
          <h2>{heroCopy.title}</h2>
          <p>{heroCopy.description}</p>
        </div>
        <div className="today-hero-actions">
          <button type="button" className="hero-primary-button hero-action-button" onClick={onCreateTask}>
            <div className="hero-action-copy">
              <span className="hero-action-kicker">创建任务</span>
              <strong>新建任务</strong>
            </div>
            <span className="hero-action-glyph">+</span>
          </button>
          <button type="button" className="hero-secondary-button hero-action-button" onClick={onOpenPlan}>
            <div className="hero-action-copy">
              <span className="hero-action-kicker">查看安排</span>
              <strong>看计划</strong>
            </div>
            <span className="hero-action-glyph">→</span>
          </button>
        </div>
      </div>

      <div className="today-priority-strip" aria-label="今日重点信息">
        <span className={overdueCount > 0 ? 'today-priority-chip today-priority-chip-danger' : 'today-priority-chip'}>
          <span className="today-priority-chip-label">逾期</span>
          <strong>{overdueCount}</strong>
        </span>
        <span className={dueTodayCount > 0 ? 'today-priority-chip today-priority-chip-warning' : 'today-priority-chip'}>
          <span className="today-priority-chip-label">今天到期</span>
          <strong>{dueTodayCount}</strong>
        </span>
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">稍后处理</span>
          <strong>{laterCount}</strong>
        </span>
        <span className={completedCount > 0 ? 'today-priority-chip today-priority-chip-success' : 'today-priority-chip'}>
          <span className="today-priority-chip-label">已完成</span>
          <strong>{completedCount}</strong>
        </span>
      </div>

      {primaryTask ? (
        <button type="button" className="today-focus-card" onClick={() => onOpenTask(primaryTask)}>
          <div className="today-focus-topline">
            <span className="today-focus-label">当前焦点</span>
            <span className="today-focus-queue">{queueText || '先从这件事开始'}</span>
          </div>
          <div className="today-focus-body">
            <div className="today-focus-title-wrap">
              <div className="today-focus-title">{primaryTask.title}</div>
              <span className="today-focus-arrow">↗</span>
            </div>
            <div className="today-focus-meta">
              <StatusPill status={primaryTask.status} />
              <span>{formatDateTime(getTaskScheduleAt(primaryTask))}</span>
              {primaryTask.project && <span>{primaryTask.project}</span>}
            </div>
            {primaryTask.description && <p className="today-focus-desc">{primaryTask.description}</p>}
          </div>
        </button>
      ) : (
        <div className="today-focus-empty">
          <span className="today-focus-label">当前焦点</span>
          <strong>今天没有堆在眼前的急事。</strong>
          <p>如果突然想到新任务，可以直接新建；如果只是想回看安排，去计划页更合适。</p>
        </div>
      )}
    </section>
  );
}
