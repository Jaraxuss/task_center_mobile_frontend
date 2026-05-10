import { TaskRow } from '../components';
import { Task, TaskStatus } from '../types';
import { formatDateTimeShort, statusLabelMap } from '../utils';

export function HistoryHero({
  items,
  filters,
  onOpenFilter,
  onResetFilters,
}: {
  items: Task[];
  filters: { q: string; status: string; date: string };
  onOpenFilter: () => void;
  onResetFilters: () => void;
}) {
  const doneCount = items.filter((item) => item.status === 'done').length;
  const changedProjects = Array.from(new Set(items.map((item) => item.project).filter(Boolean))).length;
  const activeFilterCount = [filters.q, filters.status, filters.date].filter(Boolean).length;
  const latestUpdated = items[0]?.updated_at;

  return (
    <section className="today-hero card-section accent-muted history-hero-compact">
      <div className="today-hero-main">
        <div className="today-hero-heading">
          <span className="topbar-kicker">历史回看</span>
          <h2>{activeFilterCount > 0 ? `带着 ${activeFilterCount} 个条件回看最近改动` : '把最近动过的事快速找回来'}</h2>
          <p>
            {activeFilterCount > 0
              ? '范围已经收窄，适合带着问题回看。'
              : '想回想最近几天改了什么，这里会比盲翻更快。'}
          </p>
        </div>

        <div className={activeFilterCount > 0 ? 'today-hero-actions history-hero-actions' : 'today-hero-actions history-hero-actions history-hero-actions-single'}>
          <button type="button" className="hero-primary-button hero-action-button" onClick={onOpenFilter}>
            <span className="hero-action-copy">
              <span className="hero-action-kicker">回看工具</span>
              <strong>调整筛选</strong>
            </span>
            <span className="hero-action-glyph">⌕</span>
          </button>
          {activeFilterCount > 0 && (
            <button type="button" className="hero-secondary-button hero-action-button" onClick={onResetFilters}>
              <span className="hero-action-copy">
                <span className="hero-action-kicker">快速恢复</span>
                <strong>清空条件</strong>
              </span>
              <span className="hero-action-glyph">↺</span>
            </button>
          )}
        </div>

        {(filters.q || filters.status || filters.date) && (
          <div className="history-filter-strip" aria-label="当前筛选条件">
            {filters.q && <span className="history-filter-pill">关键词：{filters.q}</span>}
            {filters.status && <span className="history-filter-pill">状态：{statusLabelMap[filters.status as TaskStatus] || filters.status}</span>}
            {filters.date && <span className="history-filter-pill">日期：{filters.date}</span>}
          </div>
        )}
      </div>

      <div className="today-priority-strip history-priority-strip">
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">当前结果</span>
          <strong>{items.length}</strong>
        </span>
        <span className="today-priority-chip today-priority-chip-success">
          <span className="today-priority-chip-label">已完成</span>
          <strong>{doneCount}</strong>
        </span>
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">涉及项目</span>
          <strong>{changedProjects}</strong>
        </span>
        <span className="today-priority-chip today-priority-chip-compact-value">
          <span className="today-priority-chip-label">最近更新</span>
          <strong className="today-priority-chip-time">{latestUpdated ? formatDateTimeShort(latestUpdated) : '暂无'}</strong>
        </span>
      </div>
    </section>
  );
}

export function HistoryDaySection({
  title,
  tasks,
  total,
  onOpenTask,
  showTotal = false,
}: {
  title: string;
  tasks: Task[];
  total: number;
  onOpenTask: (task: Task) => void;
  showTotal?: boolean;
}) {
  return (
    <section className="history-day card-section accent-muted">
      <div className="section-heading history-day-heading">
        <div className="section-heading-copy">
          <strong>{title}</strong>
          <span>{showTotal ? `共 ${total} 项记录，先看最近这一批。` : '按最近更新时间倒序，方便快速回想当时做了什么。'}</span>
        </div>
        <div className="section-heading-side">
          <span className="section-count-badge">{tasks.length} 项</span>
        </div>
      </div>
      <div className="task-list history-task-list">
        {tasks.map((task) => <TaskRow key={task.id} task={task} onClick={() => onOpenTask(task)} showUpdated />)}
      </div>
    </section>
  );
}
