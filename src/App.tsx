import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { useAsyncData, usePersistentState } from './hooks';
import {
  BOARD_CONTENT_MAX_DEFAULT,
  buildHash,
  buildProjectOrderPayload,
  buildRecurrencePayload,
  clampBoardContentMaxLength,
  formatDateTimeInput,
  getHistoryDateGroups,
  groupFactsByCustomer,
  groupMaterialsByBatch,
  localNowString,
  makeFactFormState,
  makeMaterialFormState,
  makeOptimisticTask,
  makeTaskFormState,
  parseRouteState,
  regroupBoardStatusGroups,
  regroupPlanGroups,
  sortKnowledgeCustomersWithPreference,
  sortProjectGroupsWithPreference,
  sortTasksWithPreference,
  statusOrder,
  toIsoOrNull,
  upsertTask,
} from './lib';
import type {
  BoardMode,
  FactFormState,
  KnowledgeMode,
  MaterialFormState,
  TabKey,
  TaskActionType,
  TaskFormState,
} from './lib';
import {
  MoveArrowIcon,
  PinIcon,
  StateCard,
  factStatusLabelMap,
  materialStatusLabelMap,
} from './components';
import {
  FactCustomerPickerSheet,
  FactEditorSheet,
  HistoryFilterSheet,
  MaterialEditorSheet,
  SettingsSheet,
  TaskActionSheet,
  TaskDetailSheet,
  TaskEditorSheet,
  type ActionSheetState,
  type TaskFormMode,
  type ThemeMode,
} from './sheets';
import {
  BoardHero,
  HistoryDaySection,
  HistoryHero,
  KnowledgeFactCustomerCard,
  KnowledgeHero,
  MaterialBatchGroupSection,
  PlanDaySection,
  PlanHero,
  TaskGroupSection,
  TodayHero,
} from './views';
import { BoardPreferences, Customer, CustomerMaterial, CustomerMaterialStatus, DashboardBoardGroup, DashboardPlan, DashboardToday, Fact, FactStatus, HistoryResponse, KnowledgeFactsOverview, KnowledgePreferences, PlanGroup, Task, TaskStatus, UpdateCustomerMaterialPayload, UpdateFactPayload, UpdateTaskPayload } from './types';
import { TimeFormatMode, getDateKey, groupTasksByProject, groupTodayTasks, sortTasksByUpdated, toDateMillis } from './utils';

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'today', label: '今日', icon: '◉' },
  { key: 'plan', label: '计划', icon: '☷' },
  { key: 'board', label: '看板', icon: '▣' },
  { key: 'knowledge', label: '知识', icon: '◇' },
  { key: 'history', label: '历史', icon: '↺' },
];

const boardGroupDescriptions: Record<TaskStatus, string> = {
  todo: '还没开动，但已经进入手里这盘活。先排优先级，再决定谁先推进。',
  doing: '已经在动的事项，适合快速扫一眼当前推进面。',
  deferred: '不是不做，只是被顺延。定期回看，别让它们长期漂着。',
  done: '已经收口的事项，保留回看价值，但不该抢当前注意力。',
  canceled: '明确停止推进的事项，留作判断记录，不再投入精力。',
};

function App() {
  const initialRoute = parseRouteState();
  const [activeTab, setActiveTab] = useState<TabKey>(initialRoute.tab);
  const [boardMode, setBoardMode] = useState<BoardMode>(initialRoute.boardMode);
  const [theme, setTheme] = usePersistentState<ThemeMode>('task-center-mobile-theme', 'light');
  const [timeFormat, setTimeFormat] = usePersistentState<TimeFormatMode>('task-center-mobile-time-format', 'cn-short');
  const [boardContentMaxLength, setBoardContentMaxLength] = usePersistentState<number>('task-center-mobile-board-content-max-length', BOARD_CONTENT_MAX_DEFAULT);
  const [showSettings, setShowSettings] = useState(false);
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
  const [materialDraft, setMaterialDraft] = useState<MaterialFormState | null>(null);
  const [materialStatusFilter, setMaterialStatusFilter] = useState<CustomerMaterialStatus | ''>('');
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>(initialRoute.knowledgeMode);
  const [factDraft, setFactDraft] = useState<FactFormState | null>(null);
  const [factStatusFilter, setFactStatusFilter] = useState<FactStatus | ''>('');
  const [factSheetOverTask, setFactSheetOverTask] = useState(false);
  const [factCustomerPickerOpen, setFactCustomerPickerOpen] = useState(false);
  const [materialFactsLoading, setMaterialFactsLoading] = useState(false);
  const [materialFactIds, setMaterialFactIds] = useState<number[]>([]);
  const [materialLinkedFacts, setMaterialLinkedFacts] = useState<Fact[]>([]);
  const [currentFact, setCurrentFact] = useState<Fact | null>(null);
  const [boardProjectQuery, setBoardProjectQuery] = useState('');
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<string[]>([]);
  const [expandedStatusKeys, setExpandedStatusKeys] = useState<string[]>(statusOrder);
  const [knowledgeProjectFacts, setKnowledgeProjectFacts] = useState<Record<string, Fact[]>>({});
  const [knowledgeProjectFactsLoading, setKnowledgeProjectFactsLoading] = useState<Record<string, boolean>>({});
  const [knowledgeCustomerQuery, setKnowledgeCustomerQuery] = useState('');
  const [expandedKnowledgeCustomerIds, setExpandedKnowledgeCustomerIds] = useState<number[]>([]);
  const [expandedKnowledgeProjectKeys, setExpandedKnowledgeProjectKeys] = useState<string[]>([]);
  const projectLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const historyLoadMoreRef = useRef<HTMLDivElement | null>(null);

  const today = useAsyncData(() => api.getTodayDashboard(), [], activeTab === 'today');
  const plan = useAsyncData(() => api.getPlanDashboard(), [], activeTab === 'plan');
  const board = useAsyncData(() => api.getBoardDashboard(), [], activeTab === 'board');
  const allTasks = useAsyncData(() => api.getTasks(), [], activeTab === 'board');
  const projects = useAsyncData(() => api.getProjects(), [], activeTab === 'board' || editorMode !== null);
  const boardPreferences = useAsyncData(() => api.getBoardPreferences(), [], activeTab === 'board');
  const knowledgePreferences = useAsyncData(() => api.getKnowledgePreferences(), [], activeTab === 'knowledge');
  const knowledgeFactOverview = useAsyncData(
    () => api.getKnowledgeFactsOverview({ status: factStatusFilter }),
    [factStatusFilter],
    activeTab === 'knowledge',
  );
  const customerMaterials = useAsyncData(
    () => api.getCustomerMaterials({ limit: 300 }),
    [],
    activeTab === 'knowledge' && knowledgeMode === 'materials',
  );
  const reviewBatches = useAsyncData(
    () => api.getReviewBatches(),
    [],
    activeTab === 'knowledge' && knowledgeMode === 'materials',
  );
  const customers = useAsyncData(
    () => api.getCustomers(),
    [],
    activeTab === 'knowledge' || factDraft !== null,
  );
  const taskMaterials = useAsyncData(
    () => (selectedTask ? api.getTaskCustomerMaterials(selectedTask.id) : Promise.resolve([])),
    [selectedTask?.id],
    Boolean(selectedTask),
  );
  const taskFacts = useAsyncData(
    () => (selectedTask ? api.getTaskFacts(selectedTask.id) : Promise.resolve([])),
    [selectedTask?.id],
    Boolean(selectedTask),
  );
  const history = useAsyncData(
    () => api.getHistoryDashboard({ q: historyFilters.q || undefined, status: historyFilters.status || undefined, date: historyFilters.date || undefined }),
    [historyFilters.q, historyFilters.status, historyFilters.date],
    activeTab === 'history',
  );

  const boardPreferenceData: BoardPreferences = boardPreferences.data || { task_order: [], pinned_projects: [], project_order: [] };
  const orderedBoardStatusGroups = useMemo(
    () => (board.data?.groups || []).map((group: DashboardBoardGroup) => ({ ...group, tasks: sortTasksWithPreference(group.tasks, boardPreferenceData.task_order) })),
    [board.data?.groups, boardPreferenceData.task_order],
  );
  const orderedBoardTasks = useMemo(() => sortTasksWithPreference(allTasks.data || [], boardPreferenceData.task_order), [allTasks.data, boardPreferenceData.task_order]);
  const boardStatusGroups = orderedBoardStatusGroups;
  const boardProjectGroups = useMemo(
    () => sortProjectGroupsWithPreference(groupTasksByProject(orderedBoardTasks), boardPreferenceData.pinned_projects, boardPreferenceData.project_order),
    [orderedBoardTasks, boardPreferenceData.pinned_projects, boardPreferenceData.project_order],
  );
  const filteredProjectGroups = useMemo(() => {
    const query = boardProjectQuery.trim().toLowerCase();
    if (!query) return boardProjectGroups;
    return boardProjectGroups.filter((group) => group.title.toLowerCase().includes(query));
  }, [boardProjectGroups, boardProjectQuery]);
  const visibleProjectGroups = useMemo(() => filteredProjectGroups.slice(0, visibleProjectGroupCount), [filteredProjectGroups, visibleProjectGroupCount]);
  const boardGroups = boardMode === 'status' ? boardStatusGroups : visibleProjectGroups;
  const hasMoreProjectGroups = boardMode === 'project' && visibleProjectGroupCount < filteredProjectGroups.length;
  const historyItems = useMemo(() => sortTasksByUpdated(history.data?.items || []), [history.data]);
  const rawMaterialItems = customerMaterials.data || [];
  const materialItems = useMemo(() => (materialStatusFilter ? rawMaterialItems.filter((material) => material.status === materialStatusFilter) : rawMaterialItems), [rawMaterialItems, materialStatusFilter]);
  const materialGroups = useMemo(
    () => groupMaterialsByBatch(materialItems, reviewBatches.data || []),
    [materialItems, reviewBatches.data],
  );
  const overviewData: KnowledgeFactsOverview = knowledgeFactOverview.data || { total_fact_count: 0, customers: [] };
  const knowledgePrefData: KnowledgePreferences = knowledgePreferences.data || { pinned_customer_ids: [], customer_order_ids: [] };

  const filteredOverviewCustomers = useMemo(() => {
    const query = knowledgeCustomerQuery.trim().toLowerCase();
    let list = [...overviewData.customers];
    if (query) {
      list = list.filter((c) => c.customer_name.toLowerCase().includes(query));
    }
    return sortKnowledgeCustomersWithPreference(list, knowledgePrefData.pinned_customer_ids, knowledgePrefData.customer_order_ids);
  }, [overviewData.customers, knowledgeCustomerQuery, knowledgePrefData]);
  const customerMap = useMemo(() => {
    const map = new Map<number, Customer>();
    (customers.data || []).forEach((c) => map.set(c.id, c));
    return map;
  }, [customers.data]);
  const historyDateGroups = useMemo(() => getHistoryDateGroups(historyItems), [historyItems]);
  const visibleHistoryGroups = useMemo(() => historyDateGroups.slice(0, visibleHistoryGroupCount), [historyDateGroups, visibleHistoryGroupCount]);
  const hasMoreHistoryGroups = visibleHistoryGroupCount < historyDateGroups.length;

  useEffect(() => {
    const onHashChange = () => {
      const route = parseRouteState();
      setActiveTab(route.tab);
      setBoardMode(route.boardMode);
      setKnowledgeMode(route.knowledgeMode);
      setHistoryDraft(route.historyDraft);
      setHistoryFilters(route.historyDraft);
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.timeFormat = timeFormat;
  }, [timeFormat]);

  useEffect(() => {
    if (boardContentMaxLength !== clampBoardContentMaxLength(boardContentMaxLength)) {
      setBoardContentMaxLength(clampBoardContentMaxLength(boardContentMaxLength));
    }
  }, [boardContentMaxLength, setBoardContentMaxLength]);

  useEffect(() => {
    if (boardMode !== 'project') {
      setVisibleProjectGroupCount(6);
      return;
    }
    setVisibleProjectGroupCount(6);
    setExpandedProjectKeys([]);
  }, [boardMode, filteredProjectGroups.length]);

  useEffect(() => {
    if (boardMode !== 'project' || !hasMoreProjectGroups || !projectLoadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleProjectGroupCount((prev) => Math.min(prev + 6, filteredProjectGroups.length));
        }
      },
      { root: null, rootMargin: '240px 0px 320px 0px', threshold: 0.01 },
    );

    observer.observe(projectLoadMoreRef.current);
    return () => observer.disconnect();
  }, [boardMode, hasMoreProjectGroups, filteredProjectGroups.length]);

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
    const nextHash = buildHash(activeTab, boardMode, knowledgeMode, historyFilters);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  }, [activeTab, boardMode, knowledgeMode, historyFilters]);

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
        dueToday: tasks.filter((task) => getDateKey(task.due_at) === prev.date).length,
        overdue: tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled' && task.due_at && toDateMillis(task.due_at) < Date.now()).length,
        completed: tasks.filter((task) => task.status === 'done').length,
        open: tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled').length,
      };
      return { ...prev, tasks, summary, planGroups: prev.planGroups };
    });

    plan.setData((prev: DashboardPlan | null) => {
      if (!prev) return prev;
      const groups = regroupPlanGroups(prev.planGroups, updated);
      const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
      return { ...prev, planGroups: groups, total, open_count: total };
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
    if (activeTab === 'board') jobs.push(board.refresh(), allTasks.refresh(), projects.refresh(), boardPreferences.refresh());
    if (activeTab === 'knowledge' && knowledgeMode === 'materials') jobs.push(customerMaterials.refresh(), reviewBatches.refresh(), customers.refresh());
    if (activeTab === 'knowledge' && knowledgeMode === 'facts') jobs.push(knowledgeFactOverview.refresh(), knowledgePreferences.refresh(), customers.refresh());
    if (activeTab === 'history') jobs.push(history.refresh());
    await Promise.all(jobs);
  }

  async function saveBoardPreferences(next: Partial<BoardPreferences>) {
    const merged: BoardPreferences = {
      task_order: next.task_order ?? boardPreferenceData.task_order,
      pinned_projects: next.pinned_projects ?? boardPreferenceData.pinned_projects,
      project_order: next.project_order ?? boardPreferenceData.project_order,
    };
    boardPreferences.setData(merged);
    try {
      const saved = await api.updateBoardPreferences(next);
      boardPreferences.setData(saved);
      return saved;
    } catch (error) {
      boardPreferences.setData(boardPreferenceData);
      throw error;
    }
  }

  async function handleMoveProjectGroup(projectName: string, direction: 'up' | 'down') {
    const nextOrder = buildProjectOrderPayload(boardProjectGroups, boardPreferenceData.project_order, projectName, direction);
    if (JSON.stringify(nextOrder) === JSON.stringify(boardPreferenceData.project_order)) return;
    await saveBoardPreferences({ project_order: nextOrder });
    await projects.refresh();
  }

  async function handleTogglePinnedProject(projectName: string) {
    const current = boardPreferenceData.pinned_projects;
    const nextPinned = current.includes(projectName) ? current.filter((name) => name !== projectName) : [projectName, ...current];
    await saveBoardPreferences({ pinned_projects: nextPinned });
    await projects.refresh();
  }

  async function saveKnowledgePreferences(next: Partial<KnowledgePreferences>) {
    const merged: KnowledgePreferences = {
      pinned_customer_ids: next.pinned_customer_ids ?? knowledgePrefData.pinned_customer_ids,
      customer_order_ids: next.customer_order_ids ?? knowledgePrefData.customer_order_ids,
    };
    knowledgePreferences.setData(merged);
    try {
      const saved = await api.updateKnowledgePreferences(next);
      knowledgePreferences.setData(saved);
      return saved;
    } catch (error) {
      knowledgePreferences.setData(knowledgePrefData);
      throw error;
    }
  }

  async function handleTogglePinnedKnowledgeCustomer(customerId: number) {
    const current = knowledgePrefData.pinned_customer_ids;
    const nextPinned = current.includes(customerId) ? current.filter((id) => id !== customerId) : [customerId, ...current];
    await saveKnowledgePreferences({ pinned_customer_ids: nextPinned });
  }

  async function handleMoveKnowledgeCustomer(customerId: number, direction: 'up' | 'down') {
    const customers = filteredOverviewCustomers;
    const visibleIds = customers.map((c) => c.customer_id).filter((id) => id != null) as number[];
    const preferredVisible = knowledgePrefData.customer_order_ids.filter((id) => visibleIds.includes(id));
    const remainingVisible = visibleIds.filter((id) => !preferredVisible.includes(id));
    const orderedVisible = [...preferredVisible, ...remainingVisible];
    const currentIndex = orderedVisible.indexOf(customerId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedVisible.length) return;

    const nextVisible = [...orderedVisible];
    const [moving] = nextVisible.splice(currentIndex, 1);
    nextVisible.splice(targetIndex, 0, moving);

    const preservedHidden = knowledgePrefData.customer_order_ids.filter((id) => !visibleIds.includes(id));
    await saveKnowledgePreferences({ customer_order_ids: [...nextVisible, ...preservedHidden] });
  }

  async function loadProjectFacts(customerId: number | null, projectId: number | null) {
    const key = `${customerId ?? 'none'}:${projectId ?? 'unassigned'}`;
    if (knowledgeProjectFacts[key]) return;
    setKnowledgeProjectFactsLoading((prev) => ({ ...prev, [key]: true }));
    try {
      let result: Fact[] = [];
      if (projectId == null) {
        result = await api.getFacts({ customer_id: customerId ?? undefined, project_unassigned: true, status: factStatusFilter, limit: 100 });
      } else {
        result = await api.getFacts({ customer_id: customerId ?? undefined, project_id: projectId, status: factStatusFilter, limit: 100 });
      }
      setKnowledgeProjectFacts((prev) => ({ ...prev, [key]: result }));
    } catch {
      setKnowledgeProjectFacts((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setKnowledgeProjectFactsLoading((prev) => ({ ...prev, [key]: false }));
    }
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

  async function submitMaterialEditor() {
    if (!materialDraft) return;
    const title = materialDraft.title.trim();
    if (!title) {
      setToast({ text: '材料标题不能为空', tone: 'danger' });
      return;
    }
    const payload: UpdateCustomerMaterialPayload = {
      title,
      status: materialDraft.status,
      raw_facts_markdown: materialDraft.raw_facts_markdown,
    };
    setActionBusy('material');
    try {
      await api.updateCustomerMaterial(materialDraft.id, payload);
      setMaterialDraft(null);
      setToast({ text: '客户材料已保存', tone: 'success' });
      await Promise.all([
        customerMaterials.refresh().catch(() => undefined),
        taskMaterials.refresh().catch(() => undefined),
      ]);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '材料保存失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
  }

  async function updateMaterialStatus(material: CustomerMaterial, status: CustomerMaterialStatus) {
    setActionBusy(`material-${material.id}`);
    try {
      await api.updateCustomerMaterial(material.id, { status });
      setToast({ text: `已标记为${materialStatusLabelMap[status]}`, tone: 'success' });
      await Promise.all([customerMaterials.refresh().catch(() => undefined), taskMaterials.refresh().catch(() => undefined)]);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '状态更新失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
  }

  async function archiveMaterial(material: CustomerMaterial) {
    setActionBusy(`material-${material.id}`);
    try {
      await api.archiveCustomerMaterial(material.id);
      setToast({ text: '客户材料已归档', tone: 'success' });
      await Promise.all([customerMaterials.refresh().catch(() => undefined), taskMaterials.refresh().catch(() => undefined)]);
      if (materialDraft && materialDraft.id === material.id) setMaterialDraft(null);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '归档失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
  }

  async function loadMaterialFactIds(materialId: number) {
    setMaterialFactsLoading(true);
    try {
      const mfs = await api.getMaterialFacts(materialId);
      const ids = mfs.sort((a, b) => a.sort_order - b.sort_order).map((mf) => mf.fact_id);
      setMaterialFactIds(ids);
      if (ids.length > 0) {
        const facts = await Promise.all(ids.map((id) => api.getFact(id).catch(() => null)));
        setMaterialLinkedFacts(facts.filter((f): f is Fact => f !== null));
      } else {
        setMaterialLinkedFacts([]);
      }
    } catch {
      setMaterialFactIds([]);
      setMaterialLinkedFacts([]);
    } finally {
      setMaterialFactsLoading(false);
    }
  }

  function openMaterialDraft(material: CustomerMaterial) {
    setMaterialDraft(makeMaterialFormState(material));
    void loadMaterialFactIds(material.id);
  }

  async function submitFactEditor() {
    if (!factDraft) return;
    const title = factDraft.title.trim();
    if (!title) {
      setToast({ text: '事实标题不能为空', tone: 'danger' });
      return;
    }
    const payload: UpdateFactPayload = {
      title,
      raw_markdown: factDraft.raw_markdown,
      fact_date: toIsoOrNull(factDraft.fact_date),
      status: factDraft.status,
      value_types: factDraft.value_types,
    };
    setActionBusy('fact');
    try {
      await api.updateFact(factDraft.id, payload);
      setFactDraft(null);
      setCurrentFact(null);
      setFactSheetOverTask(false);
      setToast({ text: '事实已保存', tone: 'success' });
      await Promise.all([
        knowledgeFactOverview.refresh().catch(() => undefined),
        taskFacts.refresh().catch(() => undefined),
      ]);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '事实保存失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
  }

  async function updateFactStatusById(factId: number, status: FactStatus) {
    setActionBusy(`fact-${factId}`);
    try {
      const updated = await api.updateFact(factId, { status });
      setCurrentFact(updated);
      setFactDraft((prev) => (prev && prev.id === factId ? { ...prev, status } : prev));
      setToast({ text: `事实已标为${factStatusLabelMap[status]}`, tone: 'success' });
      await Promise.all([
        knowledgeFactOverview.refresh().catch(() => undefined),
        taskFacts.refresh().catch(() => undefined),
      ]);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '状态更新失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
  }

  async function deleteFactById(factId: number) {
    if (typeof window !== 'undefined' && !window.confirm('确定删除这条事实？')) return;
    setActionBusy(`fact-${factId}`);
    try {
      await api.deleteFact(factId);
      setFactDraft(null);
      setCurrentFact(null);
      setFactSheetOverTask(false);
      setToast({ text: '事实已删除', tone: 'success' });
      await Promise.all([
        knowledgeFactOverview.refresh().catch(() => undefined),
        taskFacts.refresh().catch(() => undefined),
      ]);
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '删除失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
  }

  async function updateFactCustomerById(factId: number, customerId: number | null) {
    setActionBusy(`fact-${factId}`);
    try {
      const payload: UpdateFactPayload = customerId == null
        ? { clear_customer: true }
        : { customer_id: customerId };
      const updated = await api.updateFact(factId, payload);
      setCurrentFact(updated);
      setFactDraft((prev) => (prev && prev.id === factId ? prev : prev));
      setToast({ text: '客户已更新', tone: 'success' });
      await Promise.all([
        knowledgeFactOverview.refresh().catch(() => undefined),
        taskFacts.refresh().catch(() => undefined),
      ]);
      return updated;
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : '客户更新失败', tone: 'danger' });
    } finally {
      setActionBusy(null);
    }
    return null;
  }

  function openFactById(factId: number) {
    void api.getFact(factId).then((loaded) => {
      setCurrentFact(loaded);
      setFactDraft(makeFactFormState(loaded));
    }).catch(() => {
      setToast({ text: '无法打开事实详情', tone: 'danger' });
    });
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

  useEffect(() => {
    setKnowledgeProjectFacts({});
  }, [factStatusFilter]);

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
            <BoardHero
              mode={boardMode}
              projects={projects.data || []}
              projectQuery={boardProjectQuery}
              allGroupsExpanded={boardMode === 'project'
                ? filteredProjectGroups.length > 0 && filteredProjectGroups.every((group: { key: string }) => expandedProjectKeys.includes(group.key))
                : boardStatusGroups.length > 0 && boardStatusGroups.every((group: DashboardBoardGroup) => expandedStatusKeys.includes(group.key))}
              onProjectQueryChange={setBoardProjectQuery}
              onToggleGroupCollapse={() => {
                if (boardMode === 'project') {
                  const allExpanded = filteredProjectGroups.length > 0 && filteredProjectGroups.every((group: { key: string }) => expandedProjectKeys.includes(group.key));
                  setExpandedProjectKeys(allExpanded ? [] : filteredProjectGroups.map((group: { key: string }) => group.key));
                  return;
                }
                const allExpanded = boardStatusGroups.length > 0 && boardStatusGroups.every((group: DashboardBoardGroup) => expandedStatusKeys.includes(group.key));
                setExpandedStatusKeys(allExpanded ? [] : boardStatusGroups.map((group: DashboardBoardGroup) => group.key));
              }}
              onChangeMode={setBoardMode}
            />
            {((boardMode === 'status' && board.loading && !board.loaded) || (boardMode === 'project' && allTasks.loading && !allTasks.loaded)) && <StateCard text="看板加载中…" />}
            {(board.error || allTasks.error || boardPreferences.error) && <StateCard text={board.error || allTasks.error || boardPreferences.error || '加载失败'} tone="danger" />}
            {!board.error && !allTasks.error && !boardPreferences.error && board.loaded && allTasks.loaded && boardGroups.length === 0 && <StateCard text={boardMode === 'project' && boardProjectQuery ? '没有匹配的客户 / 项目' : '当前没有可展示的任务'} />}
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
                : undefined;
              const isProjectGroup = boardMode === 'project';
              const pinned = isProjectGroup && boardPreferenceData.pinned_projects.includes(group.title);
              const projectIndex = isProjectGroup ? boardProjectGroups.findIndex((item) => item.key === group.key) : -1;
              const previousProject = projectIndex > 0 ? boardProjectGroups[projectIndex - 1] : null;
              const nextProject = projectIndex >= 0 && projectIndex < boardProjectGroups.length - 1 ? boardProjectGroups[projectIndex + 1] : null;
              const canMoveProjectUp = Boolean(
                isProjectGroup
                  && previousProject
                  && boardPreferenceData.pinned_projects.includes(previousProject.title) === pinned,
              );
              const canMoveProjectDown = Boolean(
                isProjectGroup
                  && nextProject
                  && boardPreferenceData.pinned_projects.includes(nextProject.title) === pinned,
              );
              const statusCollapsed = !expandedStatusKeys.includes(group.key);

              return (
                <TaskGroupSection
                  key={group.key}
                  title={group.title}
                  description={description}
                  tasks={group.tasks}
                  accent={statusAccent}
                  onOpenTask={openTask}
                  variant="board"
                  taskDescriptionMaxLength={boardContentMaxLength}
                  collapsed={isProjectGroup ? !expandedProjectKeys.includes(group.key) : statusCollapsed}
                  onToggleCollapsed={isProjectGroup
                    ? () => setExpandedProjectKeys((prev) => (prev.includes(group.key) ? prev.filter((key) => key !== group.key) : [...prev, group.key]))
                    : () => setExpandedStatusKeys((prev) => (prev.includes(group.key) ? prev.filter((key) => key !== group.key) : [...prev, group.key]))}
                  countLabel={isProjectGroup ? String(group.tasks.length) : `${group.tasks.length} 项`}
                  showToggleIcon={!isProjectGroup}
                  actions={isProjectGroup ? (
                    <div className="project-group-actions-grid">
                      <button
                        type="button"
                        className="mini-icon-button project-group-action-button project-group-action-button-up"
                        disabled={!canMoveProjectUp}
                        onClick={() => void handleMoveProjectGroup(group.title, 'up')}
                        aria-label={`上移客户 ${group.title}`}
                      >
                        <MoveArrowIcon direction="up" />
                      </button>
                      <button
                        type="button"
                        className={pinned
                          ? 'mini-icon-button mini-icon-button-active project-group-action-button project-group-action-button-pin'
                          : 'mini-icon-button project-group-action-button project-group-action-button-pin project-group-action-button-pin-inactive'}
                        onClick={() => void handleTogglePinnedProject(group.title)}
                        aria-label={pinned ? `取消置顶客户 ${group.title}` : `置顶客户 ${group.title}`}
                      >
                        {pinned ? <PinIcon active /> : <PinIcon active={false} />}
                      </button>
                      <button
                        type="button"
                        className="mini-icon-button project-group-action-button project-group-action-button-down"
                        disabled={!canMoveProjectDown}
                        onClick={() => void handleMoveProjectGroup(group.title, 'down')}
                        aria-label={`下移客户 ${group.title}`}
                      >
                        <MoveArrowIcon direction="down" />
                      </button>
                    </div>
                  ) : undefined}
                />
              );
            })}
            {boardMode === 'project' && hasMoreProjectGroups && (
              <div ref={projectLoadMoreRef} className="scroll-load-sentinel" aria-hidden="true">
                <span className="scroll-load-chip">继续下滑，自动加载更多客户</span>
              </div>
            )}
          </section>
        )}

        {activeTab === 'knowledge' && (
          <section className="page">
            <KnowledgeHero
              mode={knowledgeMode}
              onChangeMode={setKnowledgeMode}
              materialCount={rawMaterialItems.length}
              factCount={overviewData.total_fact_count}
              overviewLoading={knowledgeFactOverview.loading && !knowledgeFactOverview.loaded}
              statusFilter={knowledgeMode === 'materials' ? materialStatusFilter : ''}
              onMaterialStatusFilterChange={setMaterialStatusFilter}
              factStatusFilter={factStatusFilter}
              onFactStatusFilterChange={setFactStatusFilter}
            />

            {knowledgeMode === 'materials' && (
              <>
                {customerMaterials.loading && !customerMaterials.loaded && <StateCard text="客户材料加载中…" />}
                {customerMaterials.error && <StateCard text={customerMaterials.error} tone="danger" />}
                {!customerMaterials.loading && !customerMaterials.error && customerMaterials.loaded && materialItems.length === 0 && (
                  <StateCard text="当前没有客户材料。周期材料由周日 20:00 cron 自动生成。" />
                )}
                {!customerMaterials.error && materialGroups.map((group) => (
                  <MaterialBatchGroupSection
                    key={group.key}
                    batch={group.batch}
                    materials={group.materials}
                    customerMap={customerMap}
                    onOpen={openMaterialDraft}
                  />
                ))}
              </>
            )}

            {knowledgeMode === 'facts' && (
              <>
                {knowledgeFactOverview.loading && !knowledgeFactOverview.loaded && <StateCard text="事实加载中…" />}
                {knowledgeFactOverview.error && <StateCard text={knowledgeFactOverview.error} tone="danger" />}
                {!knowledgeFactOverview.loading && !knowledgeFactOverview.error && knowledgeFactOverview.loaded && overviewData.customers.length === 0 && (
                  <StateCard text="当前没有客户事实。由主代理在转发 / 截图 / 会议纪要场景写入。" />
                )}

                {!knowledgeFactOverview.error && knowledgeFactOverview.loaded && (
                  <div className="knowledge-customer-search-shell board-search-shell">
                    <span className="board-search-icon" aria-hidden="true">⌕</span>
                    <input
                      className="board-search-input"
                      value={knowledgeCustomerQuery}
                      onChange={(event) => setKnowledgeCustomerQuery(event.target.value)}
                      placeholder="搜索客户"
                    />
                    {knowledgeCustomerQuery ? (
                      <button type="button" className="board-search-clear" onClick={() => setKnowledgeCustomerQuery('')} aria-label="清空搜索">×</button>
                    ) : null}
                  </div>
                )}
                {!knowledgeFactOverview.error && filteredOverviewCustomers.length === 0 && knowledgeFactOverview.loaded && overviewData.customers.length > 0 && (
                  <StateCard text="没有匹配的客户" />
                )}
                {!knowledgeFactOverview.error && filteredOverviewCustomers.map((cust) => {
                  const cid = cust.customer_id;
                  const pinned = cid != null && knowledgePrefData.pinned_customer_ids.includes(cid);
                  const visibleIds = filteredOverviewCustomers.map((c) => c.customer_id).filter((id) => id != null) as number[];
                  const canMoveUp = cid != null && visibleIds.indexOf(cid) > 0;
                  const canMoveDown = cid != null && visibleIds.indexOf(cid) < visibleIds.length - 1;
                  return (
                    <KnowledgeFactCustomerCard
                      key={cid ?? 'no-customer'}
                      customerOverview={cust}
                      pinned={pinned}
                      canMoveUp={canMoveUp}
                      canMoveDown={canMoveDown}
                      expanded={expandedKnowledgeCustomerIds.includes(cid ?? -1)}
                      expandedProjectKeys={expandedKnowledgeProjectKeys}
                      projectFacts={knowledgeProjectFacts}
                      projectFactsLoading={knowledgeProjectFactsLoading}
                      onToggleCollapsed={() => setExpandedKnowledgeCustomerIds((prev) => prev.includes(cid ?? -1) ? prev.filter((id) => id !== (cid ?? -1)) : [...prev, (cid ?? -1)])}
                      onTogglePinned={() => { if (cid != null) void handleTogglePinnedKnowledgeCustomer(cid); }}
                      onMoveUp={() => { if (cid != null) void handleMoveKnowledgeCustomer(cid, 'up'); }}
                      onMoveDown={() => { if (cid != null) void handleMoveKnowledgeCustomer(cid, 'down'); }}
                      onToggleProject={(projectKey) => setExpandedKnowledgeProjectKeys((prev) => prev.includes(projectKey) ? prev.filter((k) => k !== projectKey) : [...prev, projectKey])}
                      onLoadProjectFacts={(customerId, projectId) => { void loadProjectFacts(customerId, projectId); }}
                      onOpenFact={(fact: Fact) => {
                        setCurrentFact(fact);
                        setFactDraft(makeFactFormState(fact));
                      }}
                    />
                  );
                })}
              </>
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

      <nav className="bottom-nav bottom-nav-six">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={tab.key === activeTab && !showSettings ? 'nav-item nav-item-active' : 'nav-item'}
            onClick={() => {
              setShowSettings(false);
              setActiveTab(tab.key);
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <button type="button" className={showSettings ? 'nav-item nav-item-active' : 'nav-item'} onClick={() => setShowSettings(true)}>
          <span>⚙</span>
          <span>设置</span>
        </button>
      </nav>

      {selectedTask && !(factDraft && factSheetOverTask) && (
        <TaskDetailSheet
          task={selectedTask}
          loading={detailLoading}
          materials={taskMaterials.data || []}
          materialsLoading={taskMaterials.loading}
          facts={taskFacts.data || []}
          factsLoading={taskFacts.loading}
          customerMap={customerMap}
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
          onEditMaterial={openMaterialDraft}
          onOpenFact={(factId) => {
            setFactSheetOverTask(true);
            openFactById(factId);
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

      {showSettings && (
        <SettingsSheet
          theme={theme}
          timeFormat={timeFormat}
          boardContentMaxLength={boardContentMaxLength}
          onClose={() => setShowSettings(false)}
          onThemeChange={setTheme}
          onTimeFormatChange={setTimeFormat}
          onBoardContentMaxLengthChange={(value) => setBoardContentMaxLength(clampBoardContentMaxLength(value))}
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

      {materialDraft && (() => {
        const material = rawMaterialItems.find((m) => m.id === materialDraft.id) ?? null;
        const batch = material?.review_batch_id != null
          ? (reviewBatches.data || []).find((b) => b.id === material.review_batch_id) ?? null
          : null;
        const customer = material?.customer_id != null ? customerMap.get(material.customer_id) ?? null : null;
        const linkedFacts = materialLinkedFacts;
        return (
          <MaterialEditorSheet
            draft={materialDraft}
            material={material}
            batch={batch}
            customer={customer}
            linkedFacts={linkedFacts}
            factsLoading={materialFactsLoading}
            onChange={(next) => setMaterialDraft(next)}
            onClose={() => setMaterialDraft(null)}
            onSubmit={() => void submitMaterialEditor()}
            onStatusChange={(status) => {
              if (material) void updateMaterialStatus(material, status);
            }}
            onArchive={() => {
              if (material) void archiveMaterial(material);
            }}
            onOpenFact={openFactById}
            busy={actionBusy === 'material'}
          />
        );
      })()}

      {factDraft && (factSheetOverTask || !selectedTask) && (() => {
        const fact = currentFact
          ?? (taskFacts.data || []).find((f: Fact) => f.id === factDraft.id)
          ?? null;
        const customer = fact?.customer_id != null ? customerMap.get(fact.customer_id) ?? null : null;
        return (
          <FactEditorSheet
            draft={factDraft}
            fact={fact}
            customer={customer}
            onChange={(next) => setFactDraft(next)}
            onClose={() => {
              setFactDraft(null);
              setCurrentFact(null);
              setFactSheetOverTask(false);
              setFactCustomerPickerOpen(false);
            }}
            onSubmit={() => void submitFactEditor()}
            onStatusChange={(status) => void updateFactStatusById(factDraft.id, status)}
            onDelete={() => void deleteFactById(factDraft.id)}
            onOpenTask={(taskId) => {
              // Keep factDraft so the fact sheet re-renders after the task sheet is closed.
              setFactSheetOverTask(false);
              setDetailLoading(true);
              api.getTask(taskId)
                .then((task) => setSelectedTask(task))
                .catch(() => setToast({ text: '\u65e0\u6cd5\u6253\u5f00\u5173\u8054\u4efb\u52a1', tone: 'danger' }))
                .finally(() => setDetailLoading(false));
            }}
            onOpenCustomerPicker={() => setFactCustomerPickerOpen(true)}
            busy={actionBusy === 'fact' || actionBusy === `fact-${factDraft.id}`}
          />
        );
      })()}

      {factDraft && factCustomerPickerOpen && (
        <FactCustomerPickerSheet
          customers={customers.data || []}
          currentCustomerId={currentFact?.customer_id
            ?? (taskFacts.data || []).find((f: Fact) => f.id === factDraft.id)?.customer_id
            ?? null}
          busy={actionBusy === `fact-${factDraft.id}`}
          onClose={() => setFactCustomerPickerOpen(false)}
          onSelect={async (customerId) => {
            await updateFactCustomerById(factDraft.id, customerId);
            setFactCustomerPickerOpen(false);
          }}
        />
      )}

      {toast && <div className={toast.tone === 'danger' ? 'toast toast-danger' : toast.tone === 'success' ? 'toast toast-success' : 'toast'}>{toast.text}</div>}
    </div>
  );
}


export default App;

