import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useAsyncData } from './hooks';
import { DashboardBoard, DashboardBoardGroup, DashboardToday, HistoryResponse, PlanGroup, ProjectSummary, Task } from './types';
import { fallbackPlanGroups, formatDateLabel, formatDateTime, groupTasksByProject, groupTodayTasks, sortTasksByUpdated, statusLabelMap } from './utils';

type TabKey = 'today' | 'plan' | 'board' | 'history';
type BoardMode = 'status' | 'project';

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'today', label: '今日', icon: '◉' },
  { key: 'plan', label: '计划', icon: '☷' },
  { key: 'board', label: '看板', icon: '▣' },
  { key: 'history', label: '历史', icon: '↺' },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [boardMode, setBoardMode] = useState<BoardMode>('status');
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [historyDraft, setHistoryDraft] = useState({ q: '', status: '', date: '' });
  const [historyFilters, setHistoryFilters] = useState({ q: '', status: '', date: '' });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const today = useAsyncData(() => api.getTodayDashboard(), [], activeTab === 'today' || activeTab === 'plan');
  const board = useAsyncData(() => api.getBoardDashboard(), [], activeTab === 'board' && boardMode === 'status');
  const allTasks = useAsyncData(() => api.getTasks(), [], activeTab === 'board' && boardMode === 'project');
  const projects = useAsyncData(() => api.getProjects(), [], activeTab === 'board');
  const history = useAsyncData(
    () => api.getHistoryDashboard({ q: historyFilters.q || undefined, status: historyFilters.status || undefined, date: historyFilters.date || undefined }),
    [historyFilters],
    activeTab === 'history',
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function openTask(task: Task) {
    setSelectedTask(task);
    setDetailLoading(true);
    try {
      const detail = await api.getTask(task.id);
      setSelectedTask(detail);
    } catch (error) {
      setToast(error instanceof Error ? error.message : '任务详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }

  function patchTaskEverywhere(updated: Task) {
    today.setData((prev: DashboardToday | null) => {
      if (!prev) return prev;
      const tasks = prev.tasks.map((task: Task) => (task.id === updated.id ? updated : task));
      const planGroups = prev.planGroups.map((group: PlanGroup) => ({
        ...group,
        tasks: group.tasks.map((task: Task) => (task.id === updated.id ? updated : task)),
      }));
      return { ...prev, tasks, planGroups };
    });

    board.setData((prev: DashboardBoard | null) => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map((group: DashboardBoardGroup) => ({
          ...group,
          tasks: group.tasks.map((task: Task) => (task.id === updated.id ? updated : task)),
        })),
      };
    });

    allTasks.setData((prev: Task[] | null) => (prev ? prev.map((task: Task) => (task.id === updated.id ? updated : task)) : prev));
    history.setData((prev: HistoryResponse | null) => (prev ? { ...prev, items: prev.items.map((task: Task) => (task.id === updated.id ? updated : task)) } : prev));
    setSelectedTask(updated);
  }

  async function handleTaskAction(type: 'complete' | 'reschedule' | 'defer' | 'cancel') {
    if (!selectedTask) return;
    try {
      setActionBusy(type);
      let updated: Task | null = null;
      if (type === 'complete') {
        updated = await api.completeTask(selectedTask.id);
      }
      if (type === 'reschedule') {
        const next = window.prompt('输入新的时间（ISO 或 2026-03-24T10:00）', selectedTask.due_at || '');
        if (!next) return;
        updated = await api.updateTask(selectedTask.id, { due_at: next });
      }
      if (type === 'defer') {
        const deferredTo = window.prompt('输入延期到的日期/时间', selectedTask.deferred_to || selectedTask.due_at || '');
        if (!deferredTo) return;
        updated = await api.deferTask(selectedTask.id, { deferred_to: deferredTo, due_at: deferredTo });
      }
      if (type === 'cancel') {
        const reason = window.prompt('取消原因（可选）', '');
        updated = await api.cancelTask(selectedTask.id, reason || undefined);
      }

      if (updated) {
        patchTaskEverywhere(updated);
        setToast('已更新任务');
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : '操作失败');
    } finally {
      setActionBusy(null);
    }
  }

  const todayData = today.data;
  const todayGroups = useMemo(() => groupTodayTasks(todayData?.tasks || [], todayData?.date), [todayData]);
  const planGroups = useMemo(() => {
    if (!todayData) return [] as PlanGroup[];
    return todayData.planGroups?.length ? todayData.planGroups : fallbackPlanGroups(todayData.tasks);
  }, [todayData]);
  const historyItems = useMemo(() => sortTasksByUpdated(history.data?.items || []), [history.data]);
  const boardGroups = useMemo(() => {
    if (boardMode === 'status') return board.data?.groups || [];
    return groupTasksByProject(allTasks.data || []);
  }, [boardMode, board.data, allTasks.data]);

  const currentTitle = tabs.find((tab) => tab.key === activeTab)?.label || '任务';
  const primaryActionLabel = activeTab === 'history' ? '筛选' : activeTab === 'board' ? '分组' : '刷新';
  const summary = todayData?.summary;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="topbar-kicker">task_center mobile</div>
          <h1>{currentTitle}</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              if (activeTab === 'history') {
                setShowHistoryFilter(true);
                return;
              }
              if (activeTab === 'board') {
                setBoardMode((prev) => (prev === 'status' ? 'project' : 'status'));
                return;
              }
              void today.refresh();
            }}
          >
            {primaryActionLabel}
          </button>
          <button className="icon-button" type="button" onClick={() => setToast('设置入口先留轻量占位，后面再塞真家伙。')}>
            ⋯
          </button>
        </div>
      </header>

      <main className="content">
        {activeTab === 'today' && (
          <section className="page">
            <SummaryStrip summary={summary} />
            <TaskGroupSection title="逾期" tasks={todayGroups.overdue} accent="danger" onOpenTask={openTask} />
            <TaskGroupSection title="今天到期" tasks={todayGroups.dueToday} accent="warning" onOpenTask={openTask} />
            <TaskGroupSection title="进行中" tasks={todayGroups.doing} accent="brand" onOpenTask={openTask} />
            <TaskGroupSection title="稍后 / 无具体时间" tasks={todayGroups.later} accent="muted" onOpenTask={openTask} />
            <TaskGroupSection title="已完成" tasks={todayGroups.completed} accent="success" defaultCollapsed onOpenTask={openTask} />
          </section>
        )}

        {activeTab === 'plan' && (
          <section className="page">
            <SummaryStrip summary={summary} compact />
            {today.loading && <StateCard text="正在加载计划视图…" />}
            {today.error && <StateCard text={today.error} tone="danger" />}
            {!today.loading && !today.error && planGroups.map((group: PlanGroup) => <PlanDaySection key={group.key} group={group} onOpenTask={openTask} />)}
          </section>
        )}

        {activeTab === 'board' && (
          <section className="page">
            <div className="inline-switch">
              <button type="button" className={boardMode === 'status' ? 'chip chip-active' : 'chip'} onClick={() => setBoardMode('status')}>
                按状态
              </button>
              <button type="button" className={boardMode === 'project' ? 'chip chip-active' : 'chip'} onClick={() => setBoardMode('project')}>
                按项目
              </button>
            </div>
            <BoardMeta mode={boardMode} projects={projects.data || []} />
            {(board.loading || allTasks.loading) && <StateCard text="看板加载中…" />}
            {(board.error || allTasks.error) && <StateCard text={board.error || allTasks.error || '加载失败'} tone="danger" />}
            {!board.loading && !allTasks.loading && !board.error && !allTasks.error && boardGroups.map((group: DashboardBoardGroup | { key: string; title: string; tasks: Task[] }) => (
              <TaskGroupSection key={group.key} title={group.title} tasks={group.tasks} accent="board" onOpenTask={openTask} />
            ))}
          </section>
        )}

        {activeTab === 'history' && (
          <section className="page">
            <div className="section-heading">
              <div>
                <strong>最近更新</strong>
                <span>{history.data?.total || historyItems.length} 项</span>
              </div>
              <button type="button" className="ghost-button" onClick={() => setShowHistoryFilter(true)}>
                筛选
              </button>
            </div>
            {history.loading && <StateCard text="历史记录加载中…" />}
            {history.error && <StateCard text={history.error} tone="danger" />}
            {!history.loading && !history.error && historyItems.map((task) => <TaskRow key={task.id} task={task} onClick={() => openTask(task)} showUpdated />)}
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" className={tab.key === activeTab ? 'nav-item nav-item-active' : 'nav-item'} onClick={() => setActiveTab(tab.key)}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          loading={detailLoading}
          busyAction={actionBusy}
          onClose={() => setSelectedTask(null)}
          onAction={handleTaskAction}
        />
      )}

      {showHistoryFilter && (
        <HistoryFilterSheet
          draft={historyDraft}
          onChange={setHistoryDraft}
          onClose={() => setShowHistoryFilter(false)}
          onApply={() => {
            setHistoryFilters(historyDraft);
            setShowHistoryFilter(false);
          }}
          onReset={() => {
            const next = { q: '', status: '', date: '' };
            setHistoryDraft(next);
            setHistoryFilters(next);
            setShowHistoryFilter(false);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SummaryStrip({ summary, compact = false }: { summary?: DashboardToday['summary']; compact?: boolean }) {
  return (
    <section className={compact ? 'summary-strip summary-strip-compact' : 'summary-strip'}>
      <span>今天 {summary?.dueToday || 0} 项</span>
      <span>逾期 {summary?.overdue || 0}</span>
      <span>已完成 {summary?.completed || 0}</span>
    </section>
  );
}

function TaskGroupSection({
  title,
  tasks,
  onOpenTask,
  accent,
  defaultCollapsed = false,
}: {
  title: string;
  tasks: Task[];
  onOpenTask: (task: Task) => void;
  accent: 'danger' | 'warning' | 'brand' | 'muted' | 'success' | 'board';
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!defaultCollapsed) setCollapsed(false);
  }, [defaultCollapsed]);

  return (
    <section className={`card-section accent-${accent}`}>
      <button type="button" className="section-heading collapsible-heading" onClick={() => setCollapsed((prev) => !prev)}>
        <div>
          <strong>{title}</strong>
          <span>{tasks.length} 项</span>
        </div>
        <span>{collapsed ? '+' : '−'}</span>
      </button>
      {!collapsed && (
        <div className="task-list">
          {tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onClick={() => onOpenTask(task)} />) : <EmptyHint label={`暂无${title}`} />}
        </div>
      )}
    </section>
  );
}

function PlanDaySection({ group, onOpenTask }: { group: PlanGroup; onOpenTask: (task: Task) => void }) {
  return (
    <section className="card-section agenda-section">
      <div className="section-heading">
        <div>
          <strong>{group.title || formatDateLabel(group.group_date)}</strong>
          <span>{group.tasks.length} 项</span>
        </div>
      </div>
      <div className="task-list">
        {group.tasks.length ? group.tasks.map((task) => <TaskRow key={task.id} task={task} onClick={() => onOpenTask(task)} />) : <EmptyHint label="当天暂无任务" />}
      </div>
    </section>
  );
}

function BoardMeta({ mode, projects }: { mode: BoardMode; projects: ProjectSummary[] }) {
  const meta = mode === 'status' ? '默认单列分组，先看事儿，再看多列野心。' : `项目数 ${projects.length} · 单列项目分组`;
  return <div className="helper-text">{meta}</div>;
}

function TaskRow({ task, onClick, showUpdated = false }: { task: Task; onClick: () => void; showUpdated?: boolean }) {
  return (
    <button type="button" className="task-row" onClick={onClick}>
      <div className="task-row-main">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <StatusPill status={task.status} />
          <span>{formatDateTime(task.due_at)}</span>
          {task.project && <span>{task.project}</span>}
        </div>
        {task.description && <div className="task-desc">{task.description}</div>}
      </div>
      <div className="task-row-tail">{showUpdated ? formatDateTime(task.updated_at) : '›'}</div>
    </button>
  );
}

function StatusPill({ status }: { status: Task['status'] }) {
  return <span className={`status-pill status-${status}`}>{statusLabelMap[status]}</span>;
}

function TaskDetailSheet({
  task,
  loading,
  busyAction,
  onClose,
  onAction,
}: {
  task: Task;
  loading: boolean;
  busyAction: string | null;
  onClose: () => void;
  onAction: (type: 'complete' | 'reschedule' | 'defer' | 'cancel') => void;
}) {
  return (
    <div className="overlay">
      <div className="sheet detail-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            返回
          </button>
          <strong>任务详情</strong>
          <span className="muted-text">#{task.id}</span>
        </div>

        <div className="detail-body">
          {loading && <StateCard text="详情刷新中…" />}
          <div className="detail-card">
            <h2>{task.title}</h2>
            <div className="detail-grid">
              <DetailItem label="状态" value={statusLabelMap[task.status]} />
              <DetailItem label="时间" value={formatDateTime(task.due_at)} />
              <DetailItem label="项目" value={task.project || '未分项目'} />
              <DetailItem label="更新" value={formatDateTime(task.updated_at)} />
            </div>
            <div className="detail-text">
              <div className="detail-label">描述</div>
              <p>{task.description || '暂无描述'}</p>
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-label">动作</div>
            <div className="action-grid">
              <button type="button" className="action-button action-primary" onClick={() => onAction('complete')} disabled={busyAction !== null}>
                {busyAction === 'complete' ? '处理中…' : '完成'}
              </button>
              <button type="button" className="action-button" onClick={() => onAction('reschedule')} disabled={busyAction !== null}>
                {busyAction === 'reschedule' ? '处理中…' : '改时间'}
              </button>
              <button type="button" className="action-button" onClick={() => onAction('defer')} disabled={busyAction !== null}>
                {busyAction === 'defer' ? '处理中…' : '延期'}
              </button>
              <button type="button" className="action-button action-danger" onClick={() => onAction('cancel')} disabled={busyAction !== null}>
                {busyAction === 'cancel' ? '处理中…' : '取消'}
              </button>
            </div>
            <div className="helper-text">当前已接通：完成 / 改时间 / 延期 / 取消。更复杂编辑和提醒先留给下一轮迭代。</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <div className="detail-label">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function HistoryFilterSheet({
  draft,
  onChange,
  onClose,
  onApply,
  onReset,
}: {
  draft: { q: string; status: string; date: string };
  onChange: (value: { q: string; status: string; date: string }) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className="overlay">
      <div className="sheet filter-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>历史筛选</strong>
          <button type="button" className="ghost-button" onClick={onReset}>
            重置
          </button>
        </div>
        <div className="filter-form">
          <label>
            <span>关键词</span>
            <input value={draft.q} onChange={(event) => onChange({ ...draft, q: event.target.value })} placeholder="搜标题 / 描述" />
          </label>
          <label>
            <span>状态</span>
            <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value })}>
              <option value="">全部</option>
              <option value="todo">待办</option>
              <option value="doing">进行中</option>
              <option value="deferred">已延期</option>
              <option value="done">已完成</option>
              <option value="canceled">已取消</option>
            </select>
          </label>
          <label>
            <span>日期</span>
            <input type="date" value={draft.date} onChange={(event) => onChange({ ...draft, date: event.target.value })} />
          </label>
        </div>
        <button type="button" className="primary-submit" onClick={onApply}>
          应用筛选
        </button>
      </div>
    </div>
  );
}

function StateCard({ text, tone = 'default' }: { text: string; tone?: 'default' | 'danger' }) {
  return <div className={tone === 'danger' ? 'state-card state-danger' : 'state-card'}>{text}</div>;
}

function EmptyHint({ label }: { label: string }) {
  return <div className="empty-hint">{label}</div>;
}

export default App;
