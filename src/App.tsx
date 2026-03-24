import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useAsyncData } from './hooks';
import { DashboardBoardGroup, DashboardToday, HistoryResponse, PlanGroup, ProjectSummary, Task, TaskStatus, UpdateTaskPayload } from './types';
import { fallbackPlanGroups, formatDateLabel, formatDateTime, groupTasksByProject, groupTodayTasks, sortTasksByDue, sortTasksByUpdated, statusLabelMap } from './utils';

type TabKey = 'today' | 'plan' | 'board' | 'history';
type BoardMode = 'status' | 'project';
type TaskActionType = 'complete' | 'reschedule' | 'defer' | 'cancel';
type TaskFormMode = 'create' | 'edit';

interface ActionSheetState {
  type: Exclude<TaskActionType, 'complete'>;
  datetime: string;
  reason: string;
}

interface TaskFormState {
  title: string;
  due_at: string;
  project: string;
  description: string;
  status: TaskStatus;
}

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'today', label: '今日', icon: '◉' },
  { key: 'plan', label: '计划', icon: '☷' },
  { key: 'board', label: '看板', icon: '▣' },
  { key: 'history', label: '历史', icon: '↺' },
];

const statusOrder: TaskStatus[] = ['todo', 'doing', 'deferred', 'done', 'canceled'];

const boardTitles: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  deferred: '已延期',
  done: '已完成',
  canceled: '已取消',
};

function formatDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getTaskScheduleAt(task?: Task | null) {
  if (!task) return null;
  return task.deferred_to || task.due_at || null;
}

function makeTaskFormState(task?: Task | null): TaskFormState {
  return {
    title: task?.title || '',
    due_at: formatDateTimeInput(getTaskScheduleAt(task || undefined)),
    project: task?.project || '',
    description: task?.description || '',
    status: task?.status || 'todo',
  };
}

function parseRouteState() {
  if (typeof window === 'undefined') {
    return {
      tab: 'today' as TabKey,
      boardMode: 'status' as BoardMode,
      historyDraft: { q: '', status: '', date: '' },
    };
  }

  const raw = window.location.hash.replace(/^#/, '') || '/today';
  const [pathPart, searchPart = ''] = raw.split('?');
  const tab = tabs.some((item) => `/${item.key}` === pathPart) ? (pathPart.slice(1) as TabKey) : 'today';
  const params = new URLSearchParams(searchPart);
  return {
    tab,
    boardMode: params.get('mode') === 'project' ? ('project' as BoardMode) : ('status' as BoardMode),
    historyDraft: {
      q: params.get('q') || '',
      status: params.get('status') || '',
      date: params.get('date') || '',
    },
  };
}

function buildHash(tab: TabKey, boardMode: BoardMode, historyFilters: { q: string; status: string; date: string }) {
  const params = new URLSearchParams();
  if (tab === 'board' && boardMode !== 'status') params.set('mode', boardMode);
  if (tab === 'history') {
    if (historyFilters.q) params.set('q', historyFilters.q);
    if (historyFilters.status) params.set('status', historyFilters.status);
    if (historyFilters.date) params.set('date', historyFilters.date);
  }
  const query = params.toString();
  return `#/${tab}${query ? `?${query}` : ''}`;
}

function regroupPlanGroups(groups: PlanGroup[], updated: Task) {
  const all = groups.flatMap((group) => group.tasks).filter((task, index, list) => list.findIndex((item) => item.id === task.id) === index && task.id !== updated.id);
  if (updated.status !== 'done' && updated.status !== 'canceled') all.push(updated);
  return fallbackPlanGroups(all);
}

function regroupBoardStatusGroups(groups: DashboardBoardGroup[], updated: Task) {
  const all = groups.flatMap((group) => group.tasks).filter((task, index, list) => list.findIndex((item) => item.id === task.id) === index && task.id !== updated.id);
  all.push(updated);
  return statusOrder.map((status) => ({
    key: status,
    status,
    title: boardTitles[status],
    tasks: sortTasksByDue(all.filter((task) => task.status === status)),
  }));
}

function upsertTask(list: Task[], updated: Task) {
  const exists = list.some((task) => task.id === updated.id);
  const next = exists ? list.map((task) => (task.id === updated.id ? updated : task)) : [updated, ...list];
  return sortTasksByUpdated(next);
}

function makeOptimisticTask(task: Task, type: TaskActionType, payload?: { due_at?: string | null; deferred_to?: string | null; reason?: string }) {
  const now = new Date().toISOString();
  if (type === 'complete') {
    return { ...task, status: 'done' as TaskStatus, completed_at: now, canceled_at: null, updated_at: now };
  }
  if (type === 'reschedule') {
    return { ...task, due_at: payload?.due_at ?? task.due_at ?? null, updated_at: now };
  }
  if (type === 'defer') {
    return {
      ...task,
      status: 'deferred' as TaskStatus,
      due_at: payload?.due_at ?? task.due_at ?? null,
      deferred_to: payload?.deferred_to ?? task.deferred_to ?? null,
      updated_at: now,
    };
  }
  return {
    ...task,
    status: 'canceled' as TaskStatus,
    canceled_at: now,
    completed_at: null,
    updated_at: now,
  };
}

function App() {
  const initialRoute = parseRouteState();
  const [activeTab, setActiveTab] = useState<TabKey>(initialRoute.tab);
  const [boardMode, setBoardMode] = useState<BoardMode>(initialRoute.boardMode);
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [historyDraft, setHistoryDraft] = useState(initialRoute.historyDraft);
  const [historyFilters, setHistoryFilters] = useState(initialRoute.historyDraft);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'default' | 'success' | 'danger' } | null>(null);
  const [actionSheet, setActionSheet] = useState<ActionSheetState | null>(null);
  const [editorMode, setEditorMode] = useState<TaskFormMode | null>(null);
  const [editorDraft, setEditorDraft] = useState<TaskFormState>(makeTaskFormState());

  const today = useAsyncData(() => api.getTodayDashboard(), [], activeTab === 'today' || activeTab === 'plan');
  const board = useAsyncData(() => api.getBoardDashboard(), [], activeTab === 'board');
  const allTasks = useAsyncData(() => api.getTasks(), [], activeTab === 'board');
  const projects = useAsyncData(() => api.getProjects(), [], activeTab === 'board' || editorMode !== null);
  const history = useAsyncData(
    () => api.getHistoryDashboard({ q: historyFilters.q || undefined, status: historyFilters.status || undefined, date: historyFilters.date || undefined }),
    [historyFilters.q, historyFilters.status, historyFilters.date],
    activeTab === 'history',
  );

  useEffect(() => {
    const onHashChange = () => {
      const route = parseRouteState();
      setActiveTab(route.tab);
      setBoardMode(route.boardMode);
      setHistoryDraft(route.historyDraft);
      setHistoryFilters(route.historyDraft);
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextHash = buildHash(activeTab, boardMode, historyFilters);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  }, [activeTab, boardMode, historyFilters]);

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
      setToast({ text: error instanceof Error ? error.message : '任务详情加载失败', tone: 'danger' });
    } finally {
      setDetailLoading(false);
    }
  }

  function patchTaskEverywhere(updated: Task) {
    today.setData((prev: DashboardToday | null) => {
      if (!prev) return prev;
      const tasks = upsertTask(prev.tasks.filter((task) => task.id !== updated.id || updated.status !== 'done'), updated).filter((task) => task.status !== 'canceled');
      const summary = {
        ...prev.summary,
        total: tasks.length,
        dueToday: tasks.filter((task) => task.due_at?.slice(0, 10) === prev.date).length,
        overdue: tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled' && task.due_at && new Date(task.due_at).getTime() < Date.now()).length,
        completed: tasks.filter((task) => task.status === 'done').length,
        open: tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled').length,
      };
      return { ...prev, tasks, summary, planGroups: regroupPlanGroups(prev.planGroups, updated) };
    });

    board.setData((prev) => (prev ? { ...prev, groups: regroupBoardStatusGroups(prev.groups, updated) } : prev));
    allTasks.setData((prev) => (prev ? upsertTask(prev, updated) : prev));
    history.setData((prev: HistoryResponse | null) => (prev ? { ...prev, items: upsertTask(prev.items, updated), total: Math.max(prev.total, prev.items.length) } : prev));
    setSelectedTask(updated);
  }

  async function refreshVisibleData() {
    const jobs: Array<Promise<unknown>> = [];
    if (activeTab === 'today' || activeTab === 'plan') jobs.push(today.refresh());
    if (activeTab === 'board') jobs.push(board.refresh(), allTasks.refresh(), projects.refresh());
    if (activeTab === 'history') jobs.push(history.refresh());
    await Promise.all(jobs);
  }

  async function runTaskAction(type: TaskActionType, payload?: { due_at?: string | null; deferred_to?: string | null; reason?: string }) {
    if (!selectedTask) return;

    const previousTask = selectedTask;
    const rollbackToday = today.data;
    const rollbackBoard = board.data;
    const rollbackAllTasks = allTasks.data;
    const rollbackHistory = history.data;
    const optimistic = makeOptimisticTask(selectedTask, type, payload);

    patchTaskEverywhere(optimistic);
    setActionBusy(type);

    try {
      let updated: Task;
      if (type === 'complete') updated = await api.completeTask(selectedTask.id);
      else if (type === 'reschedule') updated = await api.updateTask(selectedTask.id, { due_at: payload?.due_at ?? null });
      else if (type === 'defer') updated = await api.deferTask(selectedTask.id, { deferred_to: payload?.deferred_to || '', due_at: payload?.due_at || undefined, reason: payload?.reason });
      else updated = await api.cancelTask(selectedTask.id, payload?.reason || undefined);

      patchTaskEverywhere(updated);
      setToast({ text: type === 'complete' ? '已完成任务' : type === 'cancel' ? '已取消任务' : '已更新任务', tone: 'success' });
      setActionSheet(null);
      await refreshVisibleData();
    } catch (error) {
      today.setData(rollbackToday || null);
      board.setData(rollbackBoard || null);
      allTasks.setData(rollbackAllTasks || null);
      history.setData(rollbackHistory || null);
      setSelectedTask(previousTask);
      setToast({ text: error instanceof Error ? error.message : '操作失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
  }

  async function submitEditor() {
    const title = editorDraft.title.trim();
    if (!title) {
      setToast({ text: '标题不能为空', tone: 'danger' });
      return;
    }

    const basePayload: UpdateTaskPayload = {
      title,
      description: editorDraft.description.trim() || null,
      due_at: toIsoOrNull(editorDraft.due_at),
      project: editorDraft.project.trim() || null,
      status: editorDraft.status,
    };

    setActionBusy(editorMode === 'create' ? 'create' : 'edit');
    try {
      let updated: Task;
      if (editorMode === 'create') {
        updated = await api.createTask({ ...basePayload, title });
        if (editorDraft.status !== 'todo') {
          updated = await api.updateTask(updated.id, { status: editorDraft.status, due_at: basePayload.due_at, project: basePayload.project, description: basePayload.description });
        }
      } else if (selectedTask) {
        updated = await api.updateTask(selectedTask.id, basePayload);
      } else {
        return;
      }

      patchTaskEverywhere(updated);
      setSelectedTask(updated);
      setEditorMode(null);
      setToast({ text: editorMode === 'create' ? '任务已创建' : '任务已保存', tone: 'success' });
      await Promise.all([today.refresh(), board.refresh(), allTasks.refresh(), history.refresh(), projects.refresh()]);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '保存失败', tone: 'danger' });
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
  const projectNames = useMemo(() => (projects.data || []).map((item) => item.name).filter(Boolean), [projects.data]);

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
          {activeTab !== 'history' && (
            <button
              className="icon-button"
              type="button"
              onClick={() => {
                setEditorDraft(makeTaskFormState());
                setEditorMode('create');
              }}
              aria-label="新建任务"
            >
              +
            </button>
          )}
        </div>
      </header>

      <main className="content">
        {activeTab === 'today' && (
          <section className="page">
            <SummaryStrip summary={summary} />
            {today.loading && !today.loaded && <StateCard text="正在加载今日任务…" />}
            {today.error && <StateCard text={today.error} tone="danger" />}
            {!today.loading && !today.error && today.loaded && (
              <>
                <TaskGroupSection title="逾期" tasks={todayGroups.overdue} accent="danger" onOpenTask={openTask} />
                <TaskGroupSection title="今天到期" tasks={todayGroups.dueToday} accent="warning" onOpenTask={openTask} />
                <TaskGroupSection title="进行中" tasks={todayGroups.doing} accent="brand" onOpenTask={openTask} />
                <TaskGroupSection title="稍后 / 无具体时间" tasks={todayGroups.later} accent="muted" onOpenTask={openTask} />
                <TaskGroupSection title="已完成" tasks={todayGroups.completed} accent="success" defaultCollapsed onOpenTask={openTask} />
              </>
            )}
          </section>
        )}

        {activeTab === 'plan' && (
          <section className="page">
            <SummaryStrip summary={summary} compact />
            {today.loading && !today.loaded && <StateCard text="正在加载计划视图…" />}
            {today.error && <StateCard text={today.error} tone="danger" />}
            {!today.loading && !today.error && today.loaded && planGroups.length === 0 && <StateCard text="当前没有计划任务" />}
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
            {((boardMode === 'status' && board.loading && !board.loaded) || (boardMode === 'project' && allTasks.loading && !allTasks.loaded)) && <StateCard text="看板加载中…" />}
            {(board.error || allTasks.error) && <StateCard text={board.error || allTasks.error || '加载失败'} tone="danger" />}
            {!board.error && !allTasks.error && board.loaded && allTasks.loaded && boardGroups.length === 0 && <StateCard text="当前没有可展示的任务" />}
            {!board.error && !allTasks.error && boardGroups.map((group: DashboardBoardGroup | { key: string; title: string; tasks: Task[] }) => (
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
            {history.loading && !history.loaded && <StateCard text="历史记录加载中…" />}
            {history.error && <StateCard text={history.error} tone="danger" />}
            {!history.loading && !history.error && history.loaded && historyItems.length === 0 && <StateCard text="没有符合条件的历史记录" />}
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
          onClose={() => {
            setSelectedTask(null);
            setActionSheet(null);
          }}
          onAction={(type) => {
            if (type === 'complete') {
              void runTaskAction('complete');
              return;
            }
            setActionSheet({
              type,
              datetime: formatDateTimeInput(type === 'defer' ? selectedTask.deferred_to || selectedTask.due_at : selectedTask.due_at),
              reason: '',
            });
          }}
          onEdit={() => {
            setEditorDraft(makeTaskFormState(selectedTask));
            setEditorMode('edit');
          }}
        />
      )}

      {actionSheet && selectedTask && (
        <TaskActionSheet
          task={selectedTask}
          state={actionSheet}
          busyAction={actionBusy}
          onChange={setActionSheet}
          onClose={() => setActionSheet(null)}
          onSubmit={() => {
            if (actionSheet.type === 'reschedule') {
              const dueAt = toIsoOrNull(actionSheet.datetime);
              if (!dueAt) {
                setToast({ text: '请选择有效时间', tone: 'danger' });
                return;
              }
              void runTaskAction('reschedule', { due_at: dueAt });
              return;
            }
            if (actionSheet.type === 'defer') {
              const dueAt = toIsoOrNull(actionSheet.datetime);
              if (!dueAt) {
                setToast({ text: '请选择延期时间', tone: 'danger' });
                return;
              }
              void runTaskAction('defer', { due_at: dueAt, deferred_to: dueAt, reason: actionSheet.reason.trim() || undefined });
              return;
            }
            void runTaskAction('cancel', { reason: actionSheet.reason.trim() || undefined });
          }}
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

      {editorMode && (
        <TaskEditorSheet
          mode={editorMode}
          draft={editorDraft}
          onChange={setEditorDraft}
          onClose={() => setEditorMode(null)}
          onSubmit={() => void submitEditor()}
          busy={actionBusy === 'create' || actionBusy === 'edit'}
          projectNames={projectNames}
        />
      )}

      {toast && <div className={toast.tone === 'danger' ? 'toast toast-danger' : toast.tone === 'success' ? 'toast toast-success' : 'toast'}>{toast.text}</div>}
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
  const meta = mode === 'status' ? '默认单列分组，先看状态，再看具体活儿。' : `项目数 ${projects.length} · 单列项目分组`;
  return <div className="helper-text">{meta}</div>;
}

function TaskRow({ task, onClick, showUpdated = false }: { task: Task; onClick: () => void; showUpdated?: boolean }) {
  return (
    <button type="button" className="task-row" onClick={onClick}>
      <div className="task-row-main">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <StatusPill status={task.status} />
          <span>{formatDateTime(getTaskScheduleAt(task))}</span>
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
  onEdit,
}: {
  task: Task;
  loading: boolean;
  busyAction: string | null;
  onClose: () => void;
  onAction: (type: TaskActionType) => void;
  onEdit: () => void;
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
              <DetailItem label="时间" value={formatDateTime(getTaskScheduleAt(task))} />
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
            <div className="action-grid action-grid-wide">
              <button type="button" className="action-button action-primary" onClick={() => onAction('complete')} disabled={busyAction !== null}>
                {busyAction === 'complete' ? '处理中…' : '完成'}
              </button>
              <button type="button" className="action-button" onClick={onEdit} disabled={busyAction !== null}>
                编辑
              </button>
              <button type="button" className="action-button" onClick={() => onAction('reschedule')} disabled={busyAction !== null}>
                {busyAction === 'reschedule' ? '处理中…' : '改时间'}
              </button>
              <button type="button" className="action-button" onClick={() => onAction('defer')} disabled={busyAction !== null}>
                {busyAction === 'defer' ? '处理中…' : '延期'}
              </button>
              <button type="button" className="action-button action-danger action-button-span" onClick={() => onAction('cancel')} disabled={busyAction !== null}>
                {busyAction === 'cancel' ? '处理中…' : '取消'}
              </button>
            </div>
            <div className="helper-text">改时间 / 延期 / 取消都换成了移动端 sheet 交互，不再弹 prompt 了。</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskActionSheet({
  task,
  state,
  busyAction,
  onChange,
  onClose,
  onSubmit,
}: {
  task: Task;
  state: ActionSheetState;
  busyAction: string | null;
  onChange: (state: ActionSheetState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const title = state.type === 'reschedule' ? '改时间' : state.type === 'defer' ? '延期任务' : '取消任务';
  const submitLabel = state.type === 'reschedule' ? '保存时间' : state.type === 'defer' ? '确认延期' : '确认取消';

  return (
    <div className="overlay">
      <div className="sheet filter-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            返回
          </button>
          <strong>{title}</strong>
          <span className="muted-text">#{task.id}</span>
        </div>
        <div className="filter-form">
          {(state.type === 'reschedule' || state.type === 'defer') && (
            <label>
              <span>{state.type === 'reschedule' ? '新的时间' : '延期到'}</span>
              <input type="datetime-local" value={state.datetime} onChange={(event) => onChange({ ...state, datetime: event.target.value })} />
            </label>
          )}
          {(state.type === 'defer' || state.type === 'cancel') && (
            <label>
              <span>{state.type === 'cancel' ? '取消原因（可选）' : '延期说明（可选）'}</span>
              <textarea rows={4} value={state.reason} onChange={(event) => onChange({ ...state, reason: event.target.value })} placeholder="填一点上下文，后面回看不容易失忆。" />
            </label>
          )}
        </div>
        <button type="button" className={state.type === 'cancel' ? 'primary-submit primary-submit-danger' : 'primary-submit'} onClick={onSubmit} disabled={busyAction === state.type}>
          {busyAction === state.type ? '处理中…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

function TaskEditorSheet({
  mode,
  draft,
  onChange,
  onClose,
  onSubmit,
  busy,
  projectNames,
}: {
  mode: TaskFormMode;
  draft: TaskFormState;
  onChange: (value: TaskFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  projectNames: string[];
}) {
  return (
    <div className="overlay">
      <div className="sheet filter-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>{mode === 'create' ? '创建任务' : '编辑任务'}</strong>
          <span className="muted-text">基础表单已接通</span>
        </div>
        <div className="filter-form">
          <label>
            <span>标题</span>
            <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="任务标题" />
          </label>
          <label>
            <span>时间</span>
            <input type="datetime-local" value={draft.due_at} onChange={(event) => onChange({ ...draft, due_at: event.target.value })} />
          </label>
          <label>
            <span>项目</span>
            <input list="project-options" value={draft.project} onChange={(event) => onChange({ ...draft, project: event.target.value })} placeholder="输入或选择项目" />
          </label>
          <label>
            <span>状态</span>
            <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as TaskStatus })}>
              <option value="todo">待办</option>
              <option value="doing">进行中</option>
              <option value="deferred">已延期</option>
              <option value="done">已完成</option>
              <option value="canceled">已取消</option>
            </select>
          </label>
          <label>
            <span>描述</span>
            <textarea rows={5} value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="补充一点上下文，未来的你会感谢现在的你。" />
          </label>
        </div>
        <button type="button" className="primary-submit" onClick={onSubmit} disabled={busy}>
          {busy ? '保存中…' : mode === 'create' ? '创建任务' : '保存修改'}
        </button>
        <datalist id="project-options">
          {projectNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
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
