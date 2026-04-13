import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { useAsyncData } from './hooks';
import { DashboardBoardGroup, DashboardPlan, DashboardToday, HistoryResponse, PlanGroup, ProjectSummary, Task, TaskRecurrence, TaskStatus, UpdateTaskPayload } from './types';
import { APP_TIME_ZONE, describeRecurrence, describeRecurrenceMeta, fallbackPlanGroups, formatDateLabel, formatDateTime, formatDateTimeShort, groupTasksByProject, groupTodayTasks, normalizeWeekdays, sortTasksByDue, sortTasksByUpdated, statusLabelMap } from './utils';

type TabKey = 'today' | 'plan' | 'board' | 'history';
type BoardMode = 'status' | 'project';
type TaskActionType = 'complete' | 'reschedule' | 'defer' | 'cancel';
type TaskFormMode = 'create' | 'edit';

interface ActionSheetState {
  type: TaskActionType;
  datetime: string;
  reason: string;
}

interface TaskFormState {
  title: string;
  due_at: string;
  project: string;
  description: string;
  status: TaskStatus;
  recurrence_enabled: boolean;
  recurrence_frequency: 'daily' | 'weekly' | 'monthly';
  recurrence_interval: string;
  recurrence_weekdays: number[];
  recurrence_month_day: string;
  recurrence_until: string;
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

const boardGroupDescriptions: Record<TaskStatus, string> = {
  todo: '还没开动，但已经进入手里这盘活。先排优先级，再决定谁先推进。',
  doing: '已经在动的事项，适合快速扫一眼当前推进面。',
  deferred: '不是不做，只是被顺延。定期回看，别让它们长期漂着。',
  done: '已经收口的事项，保留回看价值，但不该抢当前注意力。',
  canceled: '明确停止推进的事项，留作判断记录，不再投入精力。',
};

const recurrenceFrequencyOptions: Array<{ value: 'daily' | 'weekly' | 'monthly'; label: string }> = [
  { value: 'daily', label: '每天 / 每 N 天' },
  { value: 'weekly', label: '每周 / 指定星期' },
  { value: 'monthly', label: '每月' },
];

const weekdayOptions = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
];

function formatDateTimeInput(value?: string | null) {
  if (!value) return '';
  const normalized = value.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return normalized;
  const withSecondsMatch = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):\d{2}(?:\.\d+)?$/);
  if (withSecondsMatch) return withSecondsMatch[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return null;
  return `${normalized}:00`;
}

function localNowString() {
  return toIsoOrNull(formatDateTimeInput(new Date().toISOString())) || new Date().toISOString();
}

function getTaskScheduleAt(task?: Task | null) {
  if (!task) return null;
  return task.deferred_to || task.due_at || null;
}

function makeTaskFormState(task?: Task | null): TaskFormState {
  const recurrence = task?.recurrence;
  const frequency = recurrence?.frequency === 'daily' || recurrence?.frequency === 'weekly' || recurrence?.frequency === 'monthly' ? recurrence.frequency : 'weekly';
  return {
    title: task?.title || '',
    due_at: formatDateTimeInput(getTaskScheduleAt(task || undefined)),
    project: task?.project || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    recurrence_enabled: Boolean(recurrence?.enabled),
    recurrence_frequency: frequency,
    recurrence_interval: String(Math.max(1, Number(recurrence?.interval || 1) || 1)),
    recurrence_weekdays: normalizeWeekdays(recurrence?.days_of_week),
    recurrence_month_day: recurrence?.day_of_month ? String(recurrence.day_of_month) : '',
    recurrence_until: formatDateTimeInput(recurrence?.end_at || ''),
  };
}

function buildRecurrencePayload(draft: TaskFormState, dueAt: string | null): TaskRecurrence | null {
  if (!draft.recurrence_enabled || !dueAt) return null;

  const interval = Math.max(1, Number(draft.recurrence_interval || 1) || 1);
  const dueDate = new Date(dueAt);
  const daysOfWeek = draft.recurrence_frequency === 'weekly'
    ? normalizeWeekdays(draft.recurrence_weekdays.length ? draft.recurrence_weekdays : [((dueDate.getDay() + 6) % 7) + 1])
    : [];
  const dayOfMonth = draft.recurrence_frequency === 'monthly'
    ? Math.min(31, Math.max(1, Number(draft.recurrence_month_day || dueDate.getDate()) || 1))
    : null;
  const hours = String(dueDate.getHours()).padStart(2, '0');
  const minutes = String(dueDate.getMinutes()).padStart(2, '0');

  return {
    enabled: true,
    frequency: draft.recurrence_frequency,
    interval,
    days_of_week: daysOfWeek,
    day_of_month: dayOfMonth,
    end_at: toIsoOrNull(draft.recurrence_until),
    timezone: APP_TIME_ZONE,
    time_of_day: `${hours}:${minutes}:00`,
    start_at: dueAt,
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

function getHistoryDateGroups(tasks: Task[]) {
  const map = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = task.updated_at?.slice(0, 10) || 'unknown';
    const list = map.get(key) || [];
    list.push(task);
    map.set(key, list);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, list]) => ({
      key,
      title: key === 'unknown' ? '更早之前' : formatDateLabel(key),
      tasks: sortTasksByUpdated(list),
    }));
}

function makeOptimisticTask(task: Task, type: TaskActionType, payload?: { due_at?: string | null; deferred_to?: string | null; reason?: string }) {
  const now = localNowString();
  if (type === 'complete') {
    return { ...task, status: 'done' as TaskStatus, completed_at: now, completion_note: payload?.reason ?? task.completion_note ?? null, canceled_at: null, updated_at: now };
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
  const [visibleProjectGroupCount, setVisibleProjectGroupCount] = useState(6);
  const [visibleHistoryGroupCount, setVisibleHistoryGroupCount] = useState(6);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'default' | 'success' | 'danger' } | null>(null);
  const [actionSheet, setActionSheet] = useState<ActionSheetState | null>(null);
  const [editorMode, setEditorMode] = useState<TaskFormMode | null>(null);
  const [editorDraft, setEditorDraft] = useState<TaskFormState>(makeTaskFormState());
  const projectLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const historyLoadMoreRef = useRef<HTMLDivElement | null>(null);

  const today = useAsyncData(() => api.getTodayDashboard(), [], activeTab === 'today');
  const plan = useAsyncData(() => api.getPlanDashboard(), [], activeTab === 'plan');
  const board = useAsyncData(() => api.getBoardDashboard(), [], activeTab === 'board');
  const allTasks = useAsyncData(() => api.getTasks(), [], activeTab === 'board');
  const projects = useAsyncData(() => api.getProjects(), [], activeTab === 'board' || editorMode !== null);
  const history = useAsyncData(
    () => api.getHistoryDashboard({ q: historyFilters.q || undefined, status: historyFilters.status || undefined, date: historyFilters.date || undefined }),
    [historyFilters.q, historyFilters.status, historyFilters.date],
    activeTab === 'history',
  );

  const boardStatusGroups = board.data?.groups || [];
  const boardProjectGroups = useMemo(() => groupTasksByProject(allTasks.data || []), [allTasks.data]);
  const visibleProjectGroups = useMemo(() => boardProjectGroups.slice(0, visibleProjectGroupCount), [boardProjectGroups, visibleProjectGroupCount]);
  const boardGroups = boardMode === 'status' ? boardStatusGroups : visibleProjectGroups;
  const hasMoreProjectGroups = boardMode === 'project' && visibleProjectGroupCount < boardProjectGroups.length;
  const historyItems = useMemo(() => sortTasksByUpdated(history.data?.items || []), [history.data]);
  const historyDateGroups = useMemo(() => getHistoryDateGroups(historyItems), [historyItems]);
  const visibleHistoryGroups = useMemo(() => historyDateGroups.slice(0, visibleHistoryGroupCount), [historyDateGroups, visibleHistoryGroupCount]);
  const hasMoreHistoryGroups = visibleHistoryGroupCount < historyDateGroups.length;

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
    if (boardMode !== 'project') {
      setVisibleProjectGroupCount(6);
      return;
    }
    setVisibleProjectGroupCount(6);
  }, [boardMode, allTasks.data]);

  useEffect(() => {
    if (boardMode !== 'project' || !hasMoreProjectGroups || !projectLoadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleProjectGroupCount((prev) => Math.min(prev + 6, boardProjectGroups.length));
        }
      },
      { root: null, rootMargin: '240px 0px 320px 0px', threshold: 0.01 },
    );

    observer.observe(projectLoadMoreRef.current);
    return () => observer.disconnect();
  }, [boardMode, hasMoreProjectGroups, boardProjectGroups.length]);

  useEffect(() => {
    setVisibleHistoryGroupCount(6);
  }, [history.data, historyFilters.q, historyFilters.status, historyFilters.date]);

  useEffect(() => {
    if (!hasMoreHistoryGroups || !historyLoadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleHistoryGroupCount((prev) => Math.min(prev + 6, historyDateGroups.length));
        }
      },
      { root: null, rootMargin: '240px 0px 320px 0px', threshold: 0.01 },
    );

    observer.observe(historyLoadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMoreHistoryGroups, historyDateGroups.length]);

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
    if (activeTab === 'today') jobs.push(today.refresh());
    if (activeTab === 'plan') jobs.push(plan.refresh());
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
      if (type === 'complete') updated = await api.completeTask(selectedTask.id, { note: payload?.reason || undefined });
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

    const dueAt = toIsoOrNull(editorDraft.due_at);
    if (editorDraft.recurrence_enabled && !dueAt) {
      setToast({ text: '周期性提醒需要先设置首个提醒时间', tone: 'danger' });
      return;
    }

    const basePayload: UpdateTaskPayload = {
      title,
      description: editorDraft.description.trim() || null,
      due_at: dueAt,
      project: editorDraft.project.trim() || null,
      status: editorDraft.status,
      recurrence: buildRecurrencePayload(editorDraft, dueAt),
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
      await Promise.all([today.refresh(), plan.refresh(), board.refresh(), allTasks.refresh(), history.refresh(), projects.refresh()]);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '保存失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
  }

  const todayData = today.data;
  const planData = plan.data;
  const todayGroups = useMemo(() => groupTodayTasks(todayData?.tasks || [], todayData?.date), [todayData]);
  const planGroups = useMemo(() => {
    if (!planData) return [] as PlanGroup[];
    return planData.planGroups || [];
  }, [planData]);
  const summary = todayData?.summary;
  const projectNames = useMemo(() => (projects.data || []).map((item) => item.name).filter(Boolean), [projects.data]);

  return (
    <div className="app-shell">
      <main className="content">
        {activeTab === 'today' && (
          <section className="page">
            <TodayHero
              summary={summary}
              groups={todayGroups}
              onCreateTask={() => {
                setEditorDraft(makeTaskFormState());
                setEditorMode('create');
              }}
              onOpenPlan={() => setActiveTab('plan')}
              onOpenTask={openTask}
            />
            {today.loading && !today.loaded && <StateCard text="正在加载今日任务…" />}
            {today.error && <StateCard text={today.error} tone="danger" />}
            {!today.loading && !today.error && today.loaded && (
              <>
                {todayGroups.overdue.length === 0 && todayGroups.dueToday.length === 0 && todayGroups.later.length === 0 && todayGroups.completed.length === 0 && (
                  <StateCard text="今天暂时没有待处理任务，节奏还算稳。" />
                )}
                <TaskGroupSection title="逾期" description="已经过点的事，先止血，再排今天后面的活。" tasks={todayGroups.overdue} accent="danger" onOpenTask={openTask} hideWhenEmpty variant="today" />
                <TaskGroupSection title="今天到期" description="今天还没到点、但今天必须收口的事项。" tasks={todayGroups.dueToday} accent="warning" onOpenTask={openTask} hideWhenEmpty variant="today" />
                <TaskGroupSection title="稍后处理" description="暂时不在最前面，但也别让它们消失。" tasks={todayGroups.later} accent="muted" onOpenTask={openTask} hideWhenEmpty variant="today" />
                <TaskGroupSection title="已完成" description="今天已经收口的事项，默认折叠。" tasks={todayGroups.completed} accent="success" defaultCollapsed onOpenTask={openTask} hideWhenEmpty variant="today" />
              </>
            )}
          </section>
        )}

        {activeTab === 'plan' && (
          <section className="page">
            <PlanHero groups={planGroups} />
            {plan.loading && !plan.loaded && <StateCard text="正在加载计划视图…" />}
            {plan.error && <StateCard text={plan.error} tone="danger" />}
            {!plan.loading && !plan.error && plan.loaded && planGroups.length === 0 && <StateCard text="当前没有未来事项" />}
            {!plan.loading && !plan.error && planGroups.map((group: PlanGroup, index: number) => <PlanDaySection key={group.key} group={group} onOpenTask={openTask} index={index} />)}
          </section>
        )}

        {activeTab === 'board' && (
          <section className="page">
            <BoardHero mode={boardMode} projects={projects.data || []} groups={boardMode === 'status' ? boardStatusGroups : boardProjectGroups} tasks={allTasks.data || []} onChangeMode={setBoardMode} />
            {((boardMode === 'status' && board.loading && !board.loaded) || (boardMode === 'project' && allTasks.loading && !allTasks.loaded)) && <StateCard text="看板加载中…" />}
            {(board.error || allTasks.error) && <StateCard text={board.error || allTasks.error || '加载失败'} tone="danger" />}
            {!board.error && !allTasks.error && board.loaded && allTasks.loaded && boardGroups.length === 0 && <StateCard text="当前没有可展示的任务" />}
            {!board.error && !allTasks.error && boardGroups.map((group: DashboardBoardGroup | { key: string; title: string; tasks: Task[] }) => {
              const statusAccent = boardMode === 'status'
                ? ((group.key === 'todo'
                    ? 'brand'
                    : group.key === 'doing'
                      ? 'plan'
                      : group.key === 'deferred'
                        ? 'warning'
                        : group.key === 'done'
                          ? 'success'
                          : 'muted') as 'danger' | 'warning' | 'brand' | 'plan' | 'muted' | 'success' | 'board')
                : ((group.tasks.length > 0 ? 'plan' : 'muted') as 'danger' | 'warning' | 'brand' | 'plan' | 'muted' | 'success' | 'board');
              const description = boardMode === 'status'
                ? boardGroupDescriptions[group.key as TaskStatus]
                : `${group.tasks.length} 项任务挂在这个项目下，适合集中收线，不用在全局列表里来回找。`;

              return (
                <TaskGroupSection
                  key={group.key}
                  title={group.title}
                  description={description}
                  tasks={group.tasks}
                  accent={statusAccent}
                  onOpenTask={openTask}
                  variant="board"
                />
              );
            })}
            {boardMode === 'project' && hasMoreProjectGroups && (
              <div ref={projectLoadMoreRef} className="scroll-load-sentinel" aria-hidden="true">
                <span className="scroll-load-chip">继续下滑，自动加载更多项目</span>
              </div>
            )}
          </section>
        )}

        {activeTab === 'history' && (
          <section className="page">
            <HistoryHero
              items={historyItems}
              filters={historyFilters}
              onOpenFilter={() => setShowHistoryFilter(true)}
              onResetFilters={() => {
                const next = { q: '', status: '', date: '' };
                setHistoryDraft(next);
                setHistoryFilters(next);
              }}
            />
            {history.loading && !history.loaded && <StateCard text="历史记录加载中…" />}
            {history.error && <StateCard text={history.error} tone="danger" />}
            {!history.loading && !history.error && history.loaded && historyItems.length === 0 && <StateCard text="没有符合条件的历史记录" />}
            {!history.loading && !history.error && history.loaded && visibleHistoryGroups.map((group) => (
              <HistoryDaySection key={group.key} title={group.title} tasks={group.tasks} total={history.data?.total || historyItems.length} onOpenTask={openTask} showTotal={group.key === visibleHistoryGroups[0]?.key} />
            ))}
            {!history.loading && !history.error && history.loaded && hasMoreHistoryGroups && (
              <div ref={historyLoadMoreRef} className="scroll-load-sentinel" aria-hidden="true">
                <span className="scroll-load-chip">继续下滑，自动加载更多历史记录</span>
              </div>
            )}
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
            setActionSheet({
              type,
              datetime: formatDateTimeInput(type === 'defer' ? selectedTask.deferred_to || selectedTask.due_at : selectedTask.due_at),
              reason: type === 'complete' ? selectedTask.completion_note || '' : '',
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
            if (actionSheet.type === 'complete') {
              void runTaskAction('complete', { reason: actionSheet.reason.trim() || undefined });
              return;
            }
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

function TodayHero({
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

function TaskGroupSection({
  title,
  description,
  tasks,
  onOpenTask,
  accent,
  defaultCollapsed = false,
  hideWhenEmpty = false,
  variant = 'default',
}: {
  title: string;
  description?: string;
  tasks: Task[];
  onOpenTask: (task: Task) => void;
  accent: 'danger' | 'warning' | 'brand' | 'plan' | 'muted' | 'success' | 'board';
  defaultCollapsed?: boolean;
  hideWhenEmpty?: boolean;
  variant?: 'default' | 'today' | 'board';
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!defaultCollapsed) setCollapsed(false);
  }, [defaultCollapsed]);

  if (hideWhenEmpty && tasks.length === 0) return null;

  return (
    <section className={`card-section accent-${accent} ${variant === 'today' ? 'today-group-card' : ''} ${variant === 'board' ? 'board-group-card' : ''}`}>
      <button
        type="button"
        className={`section-heading collapsible-heading ${variant === 'today' ? 'today-group-heading' : ''} ${variant === 'board' ? 'board-group-heading' : ''}`}
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <div className="section-heading-copy">
          <div className="today-group-title-row">
            {variant === 'today' && <span className={`today-group-dot today-group-dot-${accent}`}></span>}
            <strong>{title}</strong>
          </div>
          {description ? <span>{description}</span> : <span>{tasks.length} 项</span>}
        </div>
        <div className="section-heading-side">
          <span className="section-count-badge">{tasks.length} 项</span>
          <span className="section-toggle-icon">{collapsed ? '+' : '−'}</span>
        </div>
      </button>
      {!collapsed && (
        <div className="task-list">
          {tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onClick={() => onOpenTask(task)} />) : <EmptyHint label={`暂无${title}`} />}
        </div>
      )}
    </section>
  );
}

function PlanHero({ groups }: { groups: PlanGroup[] }) {
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

function PlanDaySection({ group, onOpenTask, index = 0 }: { group: PlanGroup; onOpenTask: (task: Task) => void; index?: number }) {
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

function BoardHero({
  mode,
  projects,
  groups,
  tasks,
  onChangeMode,
}: {
  mode: BoardMode;
  projects: ProjectSummary[];
  groups: Array<DashboardBoardGroup | { key: string; title: string; tasks: Task[] }>;
  tasks: Task[];
  onChangeMode: (mode: BoardMode) => void;
}) {
  const openCount = tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled').length;
  const runningCount = tasks.filter((task) => task.status === 'doing').length;
  const deferredCount = tasks.filter((task) => task.status === 'deferred').length;
  const emptyGroups = groups.filter((group) => group.tasks.length === 0).length;

  return (
    <section className="today-hero card-section accent-brand-soft board-hero-compact">
      <div className="today-hero-main">
        <div className="today-hero-heading">
          <span className="topbar-kicker today-hero-kicker">看板视图</span>
          <h2>看清现在手上的任务面</h2>
          <p>按状态快速扫盘，或按项目集中收线。</p>
        </div>

        <div className="board-segmented" role="tablist" aria-label="看板分组方式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'status'}
            className={mode === 'status' ? 'board-segment board-segment-active' : 'board-segment'}
            onClick={() => onChangeMode('status')}
          >
            按状态
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'project'}
            className={mode === 'project' ? 'board-segment board-segment-active' : 'board-segment'}
            onClick={() => onChangeMode('project')}
          >
            按项目
          </button>
        </div>
      </div>

      <div className="today-priority-strip board-priority-strip" aria-label="看板概览">
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">未收口</span>
          <strong>{openCount}</strong>
        </span>
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">进行中</span>
          <strong>{runningCount}</strong>
        </span>
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">已延期</span>
          <strong>{deferredCount}</strong>
        </span>
        <span className="today-priority-chip">
          <span className="today-priority-chip-label">{mode === 'status' ? '分组' : '项目数'}</span>
          <strong>{mode === 'status' ? groups.length - emptyGroups : projects.length}</strong>
        </span>
      </div>
    </section>
  );
}

function HistoryHero({
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

function HistoryDaySection({
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

function TaskRow({ task, onClick, showUpdated = false }: { task: Task; onClick: () => void; showUpdated?: boolean }) {
  return (
    <button type="button" className="task-row" onClick={onClick}>
      <div className="task-row-main">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <StatusPill status={task.status} />
          <span className="task-meta-time">{formatDateTime(getTaskScheduleAt(task))}</span>
          {task.project && <span className="project-pill">{task.project}</span>}
          {task.recurrence?.enabled && <span className="inline-badge">{describeRecurrence(task.recurrence)}</span>}
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

function getLatestFollowupResult(task: Task) {
  if (task.completion_note?.trim()) return task.completion_note.trim();
  const events = task.events || [];
  for (const event of events) {
    const note = typeof event.payload?.note === 'string' ? event.payload.note.trim() : '';
    if (!note) continue;
    if (event.event_type === 'completed' || event.event_type === 'recurrence_advanced') return note;
  }
  return '';
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
  const latestFollowupResult = getLatestFollowupResult(task);

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
          <div className={loading ? 'detail-card detail-card-loading' : 'detail-card'}>
            <h2>{task.title}</h2>
            {latestFollowupResult && (
              <div className="detail-text">
                <div className="detail-label">{task.status === 'done' ? '本次跟进结果' : '最近一次跟进结果'}</div>
                <p>{latestFollowupResult}</p>
              </div>
            )}
            <div className="detail-grid">
              <DetailItem label="状态" value={statusLabelMap[task.status]} />
              <DetailItem label="安排时间" value={formatDateTime(getTaskScheduleAt(task))} />
              <DetailItem label="项目" value={task.project || '未分项目'} />
              <DetailItem label="最近更新" value={formatDateTime(task.updated_at)} />
              <DetailItem label="周期" value={task.recurrence?.enabled ? describeRecurrence(task.recurrence) : '单次提醒'} />
              {task.recurrence?.enabled && task.recurrence?.next_run_at && <DetailItem label="下次执行" value={formatDateTime(task.recurrence.next_run_at)} />}
            </div>
            {task.recurrence?.enabled && <div className="helper-text recurrence-helper">{describeRecurrenceMeta(task.recurrence)}</div>}
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
  const title = state.type === 'complete' ? '标记完成' : state.type === 'reschedule' ? '改时间' : state.type === 'defer' ? '延期任务' : '取消任务';
  const submitLabel = state.type === 'complete' ? '确认完成' : state.type === 'reschedule' ? '保存时间' : state.type === 'defer' ? '确认延期' : '确认取消';

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
          {(state.type === 'complete' || state.type === 'defer' || state.type === 'cancel') && (
            <label>
              <span>{state.type === 'complete' ? '跟进结果（可选）' : state.type === 'cancel' ? '取消原因（可选）' : '延期说明（可选）'}</span>
              <textarea rows={4} value={state.reason} onChange={(event) => onChange({ ...state, reason: event.target.value })} placeholder={state.type === 'complete' ? '比如使用情况、反馈、问题原因、下一步判断。' : '填一点上下文，后面回看不容易失忆。'} />
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
  const recurrenceSummary = draft.recurrence_enabled
    ? describeRecurrence(buildRecurrencePayload(draft, toIsoOrNull(draft.due_at)))
    : '单次提醒';

  return (
    <div className="overlay">
      <div className="sheet editor-sheet">
        <div className="sheet-header editor-sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>{mode === 'create' ? '新建任务' : '编辑任务'}</strong>
        </div>

        <div className="editor-form">
          <section className="editor-hero-card">
            <div className="editor-hero-copy">
              <span className="topbar-kicker editor-kicker">{mode === 'create' ? 'create task' : 'edit task'}</span>
              <h2>{mode === 'create' ? '把下一件事安排明白' : '把这件事重新定准'}</h2>
              <p>先定标题和时间，再决定它是单次提醒还是一条有节奏的周期任务。</p>
            </div>
            <div className="editor-status-row">
              <span className="editor-info-chip">{recurrenceSummary}</span>
              <span className="editor-info-chip">{draft.status ? statusLabelMap[draft.status] : '待办'}</span>
            </div>
          </section>

          <section className="editor-card editor-card-primary">
            <label className="editor-field editor-field-title">
              <span className="editor-label">标题</span>
              <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="这件事叫什么？一句话说清楚" />
            </label>

            <div className="editor-grid editor-grid-two">
              <label className="editor-field">
                <span className="editor-label">首次提醒时间</span>
                <input type="datetime-local" value={draft.due_at} onChange={(event) => onChange({ ...draft, due_at: event.target.value })} />
              </label>
              <label className="editor-field">
                <span className="editor-label">状态</span>
                <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as TaskStatus })}>
                  <option value="todo">待办</option>
                  <option value="deferred">已延期</option>
                  <option value="done">已完成</option>
                  <option value="canceled">已取消</option>
                </select>
              </label>
            </div>

            <label className="editor-field">
              <span className="editor-label">项目</span>
              <input list="project-options" value={draft.project} onChange={(event) => onChange({ ...draft, project: event.target.value })} placeholder="输入或选择项目" />
            </label>
          </section>

          <section className="editor-card recurrence-card">
            <div className="editor-card-head">
              <div>
                <div className="editor-label">周期性提醒</div>
                <strong className="editor-card-title">{recurrenceSummary}</strong>
                <p className="editor-card-note">单次任务保持干净；需要形成节奏时，再把它升级成周期任务。</p>
              </div>
              <button
                type="button"
                className={draft.recurrence_enabled ? 'mini-toggle mini-toggle-active' : 'mini-toggle'}
                onClick={() => onChange({ ...draft, recurrence_enabled: !draft.recurrence_enabled })}
              >
                {draft.recurrence_enabled ? '已开启' : '未开启'}
              </button>
            </div>

            {draft.recurrence_enabled && (
              <div className="recurrence-form editor-grid">
                <div className="editor-grid editor-grid-two">
                  <label className="editor-field">
                    <span className="editor-label">重复频率</span>
                    <select value={draft.recurrence_frequency} onChange={(event) => onChange({ ...draft, recurrence_frequency: event.target.value as TaskFormState['recurrence_frequency'] })}>
                      {recurrenceFrequencyOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="editor-field">
                    <span className="editor-label">间隔</span>
                    <input
                      inputMode="numeric"
                      value={draft.recurrence_interval}
                      onChange={(event) => onChange({ ...draft, recurrence_interval: event.target.value.replace(/[^0-9]/g, '') || '1' })}
                      placeholder="1"
                    />
                  </label>
                </div>

                {draft.recurrence_frequency === 'weekly' && (
                  <div className="editor-field">
                    <div className="editor-label">每周这些天</div>
                    <div className="option-chip-grid">
                      {weekdayOptions.map((option) => {
                        const active = draft.recurrence_weekdays.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={active ? 'chip chip-active' : 'chip'}
                            onClick={() =>
                              onChange({
                                ...draft,
                                recurrence_weekdays: active
                                  ? draft.recurrence_weekdays.filter((item) => item !== option.value)
                                  : normalizeWeekdays([...draft.recurrence_weekdays, option.value]),
                              })
                            }
                          >
                            周{option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {draft.recurrence_frequency === 'monthly' && (
                  <label className="editor-field">
                    <span className="editor-label">每月几号</span>
                    <input
                      inputMode="numeric"
                      value={draft.recurrence_month_day}
                      onChange={(event) => onChange({ ...draft, recurrence_month_day: event.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
                      placeholder="例如 15"
                    />
                  </label>
                )}

                <label className="editor-field">
                  <span className="editor-label">结束时间（可选）</span>
                  <input type="datetime-local" value={draft.recurrence_until} onChange={(event) => onChange({ ...draft, recurrence_until: event.target.value })} />
                </label>
                <div className="helper-text">当前实现里，首次提醒时间同时作为周期锚点。后端接住后，就不会再靠人脑补班。</div>
              </div>
            )}
          </section>

          <section className="editor-card editor-card-soft">
            <label className="editor-field editor-field-description">
              <span className="editor-label">描述</span>
              <textarea rows={5} value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="补充一点上下文，未来回看时会轻松很多。" />
            </label>
          </section>
        </div>

        <div className="editor-submit-bar">
          <button type="button" className="primary-submit editor-submit-button" onClick={onSubmit} disabled={busy}>
            {busy ? '保存中…' : mode === 'create' ? '创建任务' : '保存修改'}
          </button>
        </div>

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
