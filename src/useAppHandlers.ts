import { useEffect, useRef } from 'react';
import { api } from './api';
import type { AsyncState } from './hooks';
import {
  buildHash,
  buildProjectOrderPayload,
  buildRecurrencePayload,
  clampBoardContentMaxLength,
  formatDateTimeInput,
  makeFactFormState,
  makeMaterialFormState,
  makeOptimisticTask,
  parseRouteState,
  regroupBoardStatusGroups,
  regroupPlanGroups,
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
import { factStatusLabelMap, materialStatusLabelMap } from './components';
import type { ActionSheetState, TaskFormMode, ThemeMode } from './sheets';
import {
  BoardPreferences,
  CustomerMaterial,
  CustomerMaterialStatus,
  DashboardBoardGroup,
  DashboardPlan,
  DashboardToday,
  Fact,
  FactStatus,
  HistoryResponse,
  KnowledgeFactCustomerOverview,
  KnowledgePreferences,
  Task,
  UpdateCustomerMaterialPayload,
  UpdateFactPayload,
  UpdateTaskPayload,
} from './types';
import { TimeFormatMode, getDateKey, toDateMillis } from './utils';

// ── Side-effect hook ────────────────────────────────────────────

export interface SideEffectDeps {
  theme: ThemeMode;
  timeFormat: TimeFormatMode;
  boardContentMaxLength: number;
  setBoardContentMaxLength: (v: number) => void;
  activeTab: TabKey;
  boardMode: BoardMode;
  knowledgeMode: KnowledgeMode;
  historyFilters: { q: string; status: string; date: string };
  setActiveTab: (tab: TabKey) => void;
  setBoardMode: (mode: BoardMode) => void;
  setKnowledgeMode: (mode: KnowledgeMode) => void;
  setHistoryDraft: (d: { q: string; status: string; date: string }) => void;
  setHistoryFilters: (d: { q: string; status: string; date: string }) => void;
  toast: { text: string; tone?: string } | null;
  setToast: (t: null) => void;
  filteredProjectGroups: Array<{ key: string }>;
  boardStatusGroups: DashboardBoardGroup[];
  setVisibleProjectGroupCount: React.Dispatch<React.SetStateAction<number>>;
  setExpandedProjectKeys: React.Dispatch<React.SetStateAction<string[]>>;
  hasMoreProjectGroups: boolean;
  historyData: any;
  setVisibleHistoryGroupCount: React.Dispatch<React.SetStateAction<number>>;
  hasMoreHistoryGroups: boolean;
  historyDateGroups: Array<{ key: string }>;
  factStatusFilter: FactStatus | '';
  setKnowledgeProjectFacts: React.Dispatch<React.SetStateAction<Record<string, Fact[]>>>;
}

export function useAppSideEffects(deps: SideEffectDeps) {
  const {
    theme, timeFormat, boardContentMaxLength, setBoardContentMaxLength,
    activeTab, boardMode, knowledgeMode, historyFilters,
    setActiveTab, setBoardMode, setKnowledgeMode, setHistoryDraft, setHistoryFilters,
    toast, setToast,
    filteredProjectGroups, boardStatusGroups,
    setVisibleProjectGroupCount, setExpandedProjectKeys,
    hasMoreProjectGroups,
    historyData, setVisibleHistoryGroupCount,
    hasMoreHistoryGroups, historyDateGroups,
    factStatusFilter, setKnowledgeProjectFacts,
  } = deps;

  const projectLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const historyLoadMoreRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.dataset.timeFormat = timeFormat; }, [timeFormat]);

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
  }, [historyData, historyFilters.q, historyFilters.status, historyFilters.date]);

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

  useEffect(() => {
    setKnowledgeProjectFacts({});
  }, [factStatusFilter]);

  return { projectLoadMoreRef, historyLoadMoreRef };
}

// ── Handler hook ────────────────────────────────────────────────

export interface HandlerDeps {
  today: AsyncState<DashboardToday>;
  plan: AsyncState<DashboardPlan>;
  board: AsyncState<any>;
  allTasks: AsyncState<Task[]>;
  history: AsyncState<HistoryResponse>;
  projects: AsyncState<any>;
  boardPreferences: AsyncState<BoardPreferences>;
  knowledgePreferences: AsyncState<KnowledgePreferences>;
  customerMaterials: AsyncState<CustomerMaterial[]>;
  reviewBatches: AsyncState<any>;
  customers: AsyncState<any>;
  taskMaterials: AsyncState<any>;
  taskFacts: AsyncState<Fact[]>;
  knowledgeFactOverview: AsyncState<any>;

  activeTab: TabKey;
  knowledgeMode: KnowledgeMode;
  selectedTask: Task | null;
  setSelectedTask: (task: Task | null) => void;
  setDetailLoading: (loading: boolean) => void;
  setToast: (t: { text: string; tone?: 'default' | 'success' | 'danger' } | null) => void;
  actionBusy: string | null;
  setActionBusy: (busy: string | null) => void;
  actionSheet: ActionSheetState | null;
  setActionSheet: (state: ActionSheetState | null) => void;
  editorMode: TaskFormMode | null;
  editorDraft: TaskFormState;
  setEditorMode: (mode: TaskFormMode | null) => void;
  setEditorDraft: (draft: TaskFormState) => void;
  materialDraft: MaterialFormState | null;
  setMaterialDraft: (draft: MaterialFormState | null) => void;
  factDraft: FactFormState | null;
  setFactDraft: React.Dispatch<React.SetStateAction<FactFormState | null>>;
  factStatusFilter: FactStatus | '';
  setFactSheetOverTask: (v: boolean) => void;
  setFactCustomerPickerOpen: (v: boolean) => void;
  currentFact: Fact | null;
  setCurrentFact: (f: Fact | null) => void;

  boardPreferenceData: BoardPreferences;
  knowledgePrefData: KnowledgePreferences;
  boardProjectGroups: Array<{ key: string; title: string; tasks: Task[] }>;
  filteredOverviewCustomers: KnowledgeFactCustomerOverview[];

  knowledgeProjectFacts: Record<string, Fact[]>;
  setKnowledgeProjectFacts: React.Dispatch<React.SetStateAction<Record<string, Fact[]>>>;
  setKnowledgeProjectFactsLoading: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  setMaterialFactsLoading: (v: boolean) => void;
  setMaterialFactIds: (ids: number[]) => void;
  setMaterialLinkedFacts: (facts: Fact[]) => void;
}

export function useAppHandlers(deps: HandlerDeps) {
  const {
    today, plan, board, allTasks, history, projects, boardPreferences,
    knowledgePreferences, customerMaterials, reviewBatches, customers,
    taskMaterials, taskFacts, knowledgeFactOverview,
    activeTab, knowledgeMode,
    selectedTask, setSelectedTask, setDetailLoading,
    setToast, setActionBusy,
    setActionSheet,
    editorMode, editorDraft, setEditorMode,
    materialDraft, setMaterialDraft,
    factDraft, setFactDraft,
    factStatusFilter,
    setFactSheetOverTask, setFactCustomerPickerOpen,
    currentFact, setCurrentFact,
    boardPreferenceData, knowledgePrefData,
    boardProjectGroups, filteredOverviewCustomers,
    knowledgeProjectFacts,
    setKnowledgeProjectFacts, setKnowledgeProjectFactsLoading,
    setMaterialFactsLoading, setMaterialFactIds, setMaterialLinkedFacts,
  } = deps;

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

    board.setData((prev: any) => (prev ? { ...prev, groups: regroupBoardStatusGroups(prev.groups, updated) } : prev));
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
    const custs = filteredOverviewCustomers;
    const visibleIds = custs.map((c) => c.customer_id).filter((id) => id != null) as number[];
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

  return {
    openTask,
    runTaskAction,
    submitEditor,
    submitMaterialEditor,
    updateMaterialStatus,
    archiveMaterial,
    openMaterialDraft,
    submitFactEditor,
    updateFactStatusById,
    deleteFactById,
    updateFactCustomerById,
    openFactById,
    handleMoveProjectGroup,
    handleTogglePinnedProject,
    handleTogglePinnedKnowledgeCustomer,
    handleMoveKnowledgeCustomer,
    loadProjectFacts,
  };
}
