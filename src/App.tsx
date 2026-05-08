import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { useAsyncData, usePersistentState } from './hooks';
import { BoardPreferences, Customer, CustomerMaterial, CustomerMaterialFact, CustomerMaterialStatus, DashboardBoardGroup, DashboardPlan, DashboardToday, Fact, FactStatus, HistoryResponse, KnowledgeFactCustomerOverview, KnowledgeFactProjectOverview, KnowledgeFactsOverview, KnowledgePreferences, PlanGroup, ProjectSummary, ReviewBatch, Task, TaskRecurrence, TaskStatus, UpdateCustomerMaterialPayload, UpdateFactPayload, UpdateTaskPayload } from './types';
import { APP_TIME_ZONE, TimeFormatMode, currentDateKey, describeRecurrence, describeRecurrenceMeta, fallbackPlanGroups, formatDateLabel, formatDateTime, formatDateTimeShort, getDateKey, groupTasksByProject, groupTodayTasks, normalizeWeekdays, sortTasksByDue, sortTasksByUpdated, statusLabelMap, toDateMillis } from './utils';

type TabKey = 'today' | 'plan' | 'board' | 'knowledge' | 'history';
type BoardMode = 'status' | 'project';
type KnowledgeMode = 'materials' | 'facts';
type ThemeMode = 'light' | 'dark';
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

interface MaterialFormState {
  id: number;
  title: string;
  raw_facts_markdown: string;
  status: CustomerMaterialStatus;
}

interface FactFormState {
  id: number;
  title: string;
  raw_markdown: string;
  fact_date: string;
  status: FactStatus;
  value_types: string[];
}

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'today', label: '今日', icon: '◉' },
  { key: 'plan', label: '计划', icon: '☷' },
  { key: 'board', label: '看板', icon: '▣' },
  { key: 'knowledge', label: '知识', icon: '◇' },
  { key: 'history', label: '历史', icon: '↺' },
];

const materialStatusLabelMap: Record<CustomerMaterialStatus, string> = {
  pending: '待审核',
  approved: '已确认',
  skipped: '已跳过',
  uploaded: '已上传',
};

const factStatusLabelMap: Record<FactStatus, string> = {
  draft: '草稿',
  confirmed: '已确认',
  rejected: '已驳回',
};

const factValueTypeOptions = ['客户需求', '业务流程', '系统限制', '关键人信息', '客户偏好', '风险/阻塞', '解决方案', '商机/增购/续费', '售后问题', '可复用方法论'];

const reviewBatchStatusLabelMap: Record<string, string> = {
  pending: '待审核',
  partial: '部分通过',
  approved: '已确认',
  uploaded: '已上传',
};

const materialTypeLabelMap: Record<string, string> = {
  period_summary: '周期聚合',
  fact_bundle: '事实合订',
  meeting_note: '会议纪要',
  project_digest: '项目摘要',
};

const statusOrder: TaskStatus[] = ['todo', 'doing', 'deferred', 'done', 'canceled'];

const BOARD_CONTENT_MAX_MIN = 20;
const BOARD_CONTENT_MAX_DEFAULT = 50;
const BOARD_CONTENT_MAX_LIMIT = 200;

const timeFormatOptions: Array<{ value: TimeFormatMode; label: string; sample: string }> = [
  { value: 'cn-short', label: '月/日 24 小时', sample: '04/19 20:30' },
  { value: 'ymd-24', label: '年-月-日 24 小时', sample: '2026/04/19 20:30' },
  { value: 'slash-24', label: '年/月/日 24 小时', sample: '2026/04/19 20:30' },
];

function clampBoardContentMaxLength(value: number) {
  if (!Number.isFinite(value)) return BOARD_CONTENT_MAX_DEFAULT;
  return Math.min(BOARD_CONTENT_MAX_LIMIT, Math.max(BOARD_CONTENT_MAX_MIN, Math.round(value)));
}

function truncateText(value: string, maxLength?: number) {
  if (!maxLength || value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength)).trimEnd()}…`;
}

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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return null;
  return new Date(`${normalized}:00+08:00`).toISOString();
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

function makeMaterialFormState(material: CustomerMaterial): MaterialFormState {
  return {
    id: material.id,
    title: material.title || '',
    raw_facts_markdown: material.raw_facts_markdown || '',
    status: material.status || 'pending',
  };
}

function makeFactFormState(fact: Fact): FactFormState {
  return {
    id: fact.id,
    title: fact.title || '',
    raw_markdown: fact.raw_markdown || '',
    fact_date: formatDateTimeInput(fact.fact_date || ''),
    status: fact.status || 'draft',
    value_types: [...(fact.value_types || [])],
  };
}

interface MaterialBatchGroup {
  key: string;
  batch: ReviewBatch | null;
  materials: CustomerMaterial[];
}

function groupMaterialsByBatch(
  materials: CustomerMaterial[],
  batches: ReviewBatch[],
): MaterialBatchGroup[] {
  const batchMap = new Map<number, ReviewBatch>();
  batches.forEach((b) => batchMap.set(b.id, b));
  const grouped = new Map<string, CustomerMaterial[]>();
  materials.forEach((m) => {
    const key = m.review_batch_id != null ? `batch-${m.review_batch_id}` : 'unbatched';
    const list = grouped.get(key) || [];
    list.push(m);
    grouped.set(key, list);
  });
  const groups: MaterialBatchGroup[] = Array.from(grouped.entries()).map(([key, list]) => {
    const batchId = key.startsWith('batch-') ? Number(key.slice('batch-'.length)) : null;
    const batch = batchId != null ? batchMap.get(batchId) ?? null : null;
    return {
      key,
      batch,
      materials: [...list].sort((a, b) => toDateMillis(b.updated_at) - toDateMillis(a.updated_at)),
    };
  });
  // sort: batched groups first by period_end desc, then unbatched last
  groups.sort((a, b) => {
    if (!a.batch && b.batch) return 1;
    if (a.batch && !b.batch) return -1;
    if (!a.batch && !b.batch) return 0;
    const aEnd = a.batch?.period_end ? toDateMillis(a.batch.period_end) : 0;
    const bEnd = b.batch?.period_end ? toDateMillis(b.batch.period_end) : 0;
    return bEnd - aEnd;
  });
  return groups;
}

interface FactCustomerGroup {
  key: string;
  title: string;
  customer: Customer | null;
  facts: Fact[];
}

function groupFactsByCustomer(facts: Fact[], customers: Customer[]): FactCustomerGroup[] {
  const customerMap = new Map<number, Customer>();
  customers.forEach((c) => customerMap.set(c.id, c));
  const grouped = new Map<string, Fact[]>();
  facts.forEach((f) => {
    const key = f.customer_id != null ? `customer-${f.customer_id}` : 'no-customer';
    const list = grouped.get(key) || [];
    list.push(f);
    grouped.set(key, list);
  });
  const groups: FactCustomerGroup[] = Array.from(grouped.entries()).map(([key, list]) => {
    const cid = key.startsWith('customer-') ? Number(key.slice('customer-'.length)) : null;
    const customer = cid != null ? customerMap.get(cid) ?? null : null;
    const title = customer?.name || (cid != null ? `客户 #${cid}` : '未归类');
    return {
      key,
      title,
      customer,
      facts: [...list].sort((a, b) => toDateMillis(b.fact_date || b.updated_at) - toDateMillis(a.fact_date || a.updated_at)),
    };
  });
  groups.sort((a, b) => {
    if (!a.customer && b.customer) return 1;
    if (a.customer && !b.customer) return -1;
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });
  return groups;
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
      knowledgeMode: 'materials' as KnowledgeMode,
      historyDraft: { q: '', status: '', date: '' },
    };
  }

  const raw = window.location.hash.replace(/^#/, '') || '/today';
  const [pathPart, searchPart = ''] = raw.split('?');
  // Back-compat: old `#/materials` -> knowledge tab, materials sub-mode
  let rawTab: string = tabs.some((item) => `/${item.key}` === pathPart) ? pathPart.slice(1) : 'today';
  if (pathPart === '/materials') rawTab = 'knowledge';
  const tab = rawTab as TabKey;
  const params = new URLSearchParams(searchPart);
  const knowledgeModeRaw = params.get('mode');
  const knowledgeMode: KnowledgeMode = knowledgeModeRaw === 'facts' ? 'facts' : 'materials';
  return {
    tab,
    boardMode: params.get('mode') === 'project' ? ('project' as BoardMode) : ('status' as BoardMode),
    knowledgeMode,
    historyDraft: {
      q: params.get('q') || '',
      status: params.get('status') || '',
      date: params.get('date') || '',
    },
  };
}

function buildHash(
  tab: TabKey,
  boardMode: BoardMode,
  knowledgeMode: KnowledgeMode,
  historyFilters: { q: string; status: string; date: string },
) {
  const params = new URLSearchParams();
  if (tab === 'board' && boardMode !== 'status') params.set('mode', boardMode);
  if (tab === 'knowledge' && knowledgeMode !== 'materials') params.set('mode', knowledgeMode);
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
  const scheduleDate = getDateKey(updated.deferred_to || updated.due_at);
  if (updated.status !== 'done' && updated.status !== 'canceled' && scheduleDate && scheduleDate > currentDateKey()) {
    all.push(updated);
  }
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

function sortTasksWithPreference(tasks: Task[], taskOrder: number[]) {
  const orderMap = new Map(taskOrder.map((taskId, index) => [taskId, index]));
  return [...tasks].sort((a, b) => {
    const aIndex = orderMap.get(a.id);
    const bIndex = orderMap.get(b.id);
    if (aIndex != null || bIndex != null) {
      if (aIndex != null && bIndex != null) return aIndex - bIndex;
      return aIndex != null ? -1 : 1;
    }
    const byDue = sortTasksByDue([a, b]);
    return byDue[0]?.id === a.id ? -1 : 1;
  });
}

function sortProjectGroupsWithPreference(groups: Array<{ key: string; title: string; tasks: Task[] }>, pinnedProjects: string[], projectOrder: string[]) {
  const pinnedMap = new Map(pinnedProjects.map((name, index) => [name, index]));
  const projectOrderMap = new Map(projectOrder.map((name, index) => [name, index]));

  return [...groups].sort((a, b) => {
    const aPinned = pinnedMap.has(a.title);
    const bPinned = pinnedMap.has(b.title);
    if (aPinned || bPinned) {
      if (aPinned && bPinned) {
        const aPinnedIndex = pinnedMap.get(a.title) ?? 10 ** 9;
        const bPinnedIndex = pinnedMap.get(b.title) ?? 10 ** 9;
        if (aPinnedIndex !== bPinnedIndex) return aPinnedIndex - bPinnedIndex;
      } else {
        return aPinned ? -1 : 1;
      }
    }

    const aOrdered = projectOrderMap.has(a.title);
    const bOrdered = projectOrderMap.has(b.title);
    if (aOrdered || bOrdered) {
      if (aOrdered && bOrdered) return (projectOrderMap.get(a.title) ?? 0) - (projectOrderMap.get(b.title) ?? 0);
      return aOrdered ? -1 : 1;
    }

    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

function buildProjectOrderPayload(groups: Array<{ key: string; title: string; tasks: Task[] }>, currentOrder: string[], movingProjectName: string, direction: 'up' | 'down') {
  const visibleNames = groups.map((group) => group.title);
  const preferredVisible = currentOrder.filter((projectName) => visibleNames.includes(projectName));
  const remainingVisible = visibleNames.filter((projectName) => !preferredVisible.includes(projectName));
  const orderedVisible = [...preferredVisible, ...remainingVisible];
  const currentIndex = orderedVisible.indexOf(movingProjectName);
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedVisible.length) return currentOrder;

  const nextVisible = [...orderedVisible];
  const [moving] = nextVisible.splice(currentIndex, 1);
  nextVisible.splice(targetIndex, 0, moving);

  const preservedHidden = currentOrder.filter((projectName) => !visibleNames.includes(projectName));
  return [...nextVisible, ...preservedHidden];
}

function getHistoryDateGroups(tasks: Task[]) {
  const map = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = getDateKey(task.updated_at) || 'unknown';
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

function sortKnowledgeCustomersWithPreference(
  customers: KnowledgeFactCustomerOverview[],
  pinnedIds: number[],
  orderIds: number[],
): KnowledgeFactCustomerOverview[] {
  const pinnedMap = new Map(pinnedIds.map((id, idx) => [id, idx]));
  const orderMap = new Map(orderIds.map((id, idx) => [id, idx]));

  return [...customers].sort((a, b) => {
    const aId = a.customer_id ?? -1;
    const bId = b.customer_id ?? -1;

    const aPinned = aId !== -1 && pinnedMap.has(aId);
    const bPinned = bId !== -1 && pinnedMap.has(bId);
    if (aPinned || bPinned) {
      if (aPinned && bPinned) {
        return (pinnedMap.get(aId) ?? 0) - (pinnedMap.get(bId) ?? 0);
      }
      return aPinned ? -1 : 1;
    }

    const aOrdered = aId !== -1 && orderMap.has(aId);
    const bOrdered = bId !== -1 && orderMap.has(bId);
    if (aOrdered || bOrdered) {
      if (aOrdered && bOrdered) {
        return (orderMap.get(aId) ?? 0) - (orderMap.get(bId) ?? 0);
      }
      return aOrdered ? -1 : 1;
    }

    const aLatest = a.latest_fact_at || '';
    const bLatest = b.latest_fact_at || '';
    if (aLatest !== bLatest) return bLatest.localeCompare(aLatest);
    return a.customer_name.localeCompare(b.customer_name);
  });
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
  projectQuery,
  allGroupsExpanded,
  onProjectQueryChange,
  onToggleGroupCollapse,
  onChangeMode,
}: {
  mode: BoardMode;
  projects: ProjectSummary[];
  projectQuery: string;
  allGroupsExpanded: boolean;
  onProjectQueryChange: (value: string) => void;
  onToggleGroupCollapse: () => void;
  onChangeMode: (mode: BoardMode) => void;
}) {
  return (
    <section className="today-hero card-section accent-brand-soft board-hero-compact">
      <div className="board-hero-topline">
        <div className="today-hero-heading board-hero-heading-compact">
          <span className="topbar-kicker today-hero-kicker">看板视图</span>
          <h2>{mode === 'status' ? '按状态扫盘' : '按客户收线'}</h2>
          <p>{mode === 'status' ? '先看推进面，再决定今天先动哪一块。' : '搜客户、调顺序，把一条线集中收干净。'}</p>
        </div>

        <div className="board-mode-toolbar" aria-label="看板模式与分组展开控制">
          <div className="board-segmented board-segmented-compact board-segmented-flex" role="tablist" aria-label="看板分组方式">
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
              按客户
            </button>
          </div>

          <span className="board-mode-toolbar-divider" aria-hidden="true"></span>
          <button
            type="button"
            className="board-mode-toolbar-action"
            onClick={onToggleGroupCollapse}
            aria-label={mode === 'project'
              ? (allGroupsExpanded ? '全部折叠客户' : '全部展开客户')
              : (allGroupsExpanded ? '全部折叠状态分组' : '全部展开状态分组')}
            title={mode === 'project'
              ? (allGroupsExpanded ? '全部折叠客户' : '全部展开客户')
              : (allGroupsExpanded ? '全部折叠状态分组' : '全部展开状态分组')}
          >
            <ExpandToggleIcon expanded={allGroupsExpanded} />
          </button>
        </div>
      </div>

      {mode === 'project' && projects.length > 0 ? (
        <div className="board-hero-tools board-hero-tools-compact">
          <div className="board-search-shell">
            <span className="board-search-icon" aria-hidden="true">⌕</span>
            <input
              className="board-search-input"
              value={projectQuery}
              onChange={(event) => onProjectQueryChange(event.target.value)}
              placeholder="搜索客户 / 项目"
            />
            {projectQuery ? (
              <button type="button" className="board-search-clear" onClick={() => onProjectQueryChange('')} aria-label="清空客户搜索">×</button>
            ) : null}
          </div>
        </div>
      ) : null}
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

function TaskRow({
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

function MoveArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  // Lucide-style chevron-up / chevron-down
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      {direction === 'up' ? (
        <polyline points="6 15 12 9 18 15" />
      ) : (
        <polyline points="6 9 12 15 18 9" />
      )}
    </svg>
  );
}

function PinIcon({ active }: { active: boolean }) {
  // Lucide-style pin: tilted needle with rounded head
  return (
    <svg
      className={active ? 'icon-svg icon-svg-pin-active' : 'icon-svg'}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.76a3 3 0 0 0 1.13 2.34L18 15H6l1.87-1.9A3 3 0 0 0 9 10.76Z" />
    </svg>
  );
}

function ExpandToggleIcon({ expanded }: { expanded: boolean }) {
  // Lucide-style: minimize-2 when expanded, maximize-2 when collapsed
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18 }}>
      {expanded ? (
        <>
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </>
      ) : (
        <>
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </>
      )}
    </svg>
  );
}

function StatusPill({ status }: { status: Task['status'] }) {
  return <span className={`status-pill status-${status}`}>{statusLabelMap[status]}</span>;
}

function MaterialStatusPill({ status }: { status: CustomerMaterialStatus }) {
  return <span className={`material-status-pill material-status-${status}`}>{materialStatusLabelMap[status]}</span>;
}

function KnowledgeHero({
  mode,
  onChangeMode,
  materialCount,
  factCount,
  overviewLoading,
  statusFilter,
  onMaterialStatusFilterChange,
  factStatusFilter,
  onFactStatusFilterChange,
}: {
  mode: KnowledgeMode;
  onChangeMode: (mode: KnowledgeMode) => void;
  materialCount: number;
  factCount: number;
  overviewLoading?: boolean;
  statusFilter: CustomerMaterialStatus | '';
  onMaterialStatusFilterChange: (status: CustomerMaterialStatus | '') => void;
  factStatusFilter: FactStatus | '';
  onFactStatusFilterChange: (status: FactStatus | '') => void;
}) {
  return (
    <section className="module-hero card-section accent-plan material-hero knowledge-hero">
      <div className="module-hero-main">
        <div className="today-hero-heading">
          <span className="topbar-kicker today-hero-kicker">customer knowledge</span>
          <h2>{mode === 'materials' ? '周期材料审核' : '客户事实库'}</h2>
          <p>
            {mode === 'materials'
              ? '每周日 20:00 cron 自动聚合 confirmed facts 为周期材料；审核后由主代理上传 NotebookLM。'
              : '所有客户事实原文保留在这里，随时修正错别字、切换状态或删除误录。'}
          </p>
        </div>
      </div>

      <div className="knowledge-segmented board-segmented board-segmented-compact" role="tablist" aria-label="知识模块分段">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'materials'}
          className={mode === 'materials' ? 'knowledge-segment board-segment board-segment-active' : 'knowledge-segment board-segment'}
          onClick={() => onChangeMode('materials')}
        >
          材料 <strong>{materialCount}</strong>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'facts'}
          className={mode === 'facts' ? 'knowledge-segment board-segment board-segment-active' : 'knowledge-segment board-segment'}
          onClick={() => onChangeMode('facts')}
        >
          事实 <strong>{overviewLoading ? '…' : factCount}</strong>
        </button>
      </div>

      {mode === 'materials' ? (
        <div className="material-filter-row" aria-label="客户材料状态筛选">
          <button type="button" className={statusFilter === '' ? 'material-filter-chip material-filter-chip-active' : 'material-filter-chip'} onClick={() => onMaterialStatusFilterChange('')}>全部</button>
          {(Object.keys(materialStatusLabelMap) as CustomerMaterialStatus[]).map((status) => (
            <button key={status} type="button" className={statusFilter === status ? 'material-filter-chip material-filter-chip-active' : 'material-filter-chip'} onClick={() => onMaterialStatusFilterChange(status)}>
              {materialStatusLabelMap[status]}
            </button>
          ))}
        </div>
      ) : (
        <div className="material-filter-row" aria-label="事实状态筛选">
          <button type="button" className={factStatusFilter === '' ? 'material-filter-chip material-filter-chip-active' : 'material-filter-chip'} onClick={() => onFactStatusFilterChange('')}>全部</button>
          {(Object.keys(factStatusLabelMap) as FactStatus[]).map((status) => (
            <button key={status} type="button" className={factStatusFilter === status ? 'material-filter-chip material-filter-chip-active' : 'material-filter-chip'} onClick={() => onFactStatusFilterChange(status)}>
              {factStatusLabelMap[status]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function MaterialBatchGroupSection({
  batch,
  materials,
  customerMap,
  onOpen,
}: {
  batch: ReviewBatch | null;
  materials: CustomerMaterial[];
  customerMap: Map<number, Customer>;
  onOpen: (material: CustomerMaterial) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const title = batch
    ? batch.title
    : '未归批次（旧数据）';
  const period = batch?.period_start && batch?.period_end
    ? `${(batch.period_start || '').slice(0, 10)} ~ ${(batch.period_end || '').slice(0, 10)}`
    : '';
  return (
    <section className="card-section accent-board material-group-card">
      <div className="section-heading board-group-heading">
        <button type="button" className="section-heading-main collapsible-heading" onClick={() => setCollapsed((prev) => !prev)}>
          <div className="section-heading-copy">
            <strong>{title}</strong>
            <span>
              {period && <>{period} · </>}
              {batch && <>{reviewBatchStatusLabelMap[batch.status] || batch.status} · </>}
              {materials.length} 份材料
            </span>
          </div>
          <span className="collapse-indicator">{collapsed ? '⌄' : '⌃'}</span>
        </button>
      </div>
      {!collapsed && (
        <div className="material-list">
          {materials.map((material) => {
            const customerName = material.customer_id != null
              ? customerMap.get(material.customer_id)?.name
              : null;
            return (
              <MaterialRowWithCustomer
                key={material.id}
                material={material}
                customerName={customerName || null}
                onOpen={() => onOpen(material)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function MaterialRowWithCustomer({
  material,
  customerName,
  onOpen,
}: {
  material: CustomerMaterial;
  customerName: string | null;
  onOpen: () => void;
}) {
  const preview = material.raw_facts_markdown || '暂无正文';
  return (
    <article className="material-row">
      <button type="button" className="material-row-main" onClick={onOpen}>
        <div className="material-row-title-line">
          <strong>{material.title}</strong>
          <MaterialStatusPill status={material.status} />
        </div>
        <div className="material-row-meta">
          {customerName && <span>{customerName}</span>}
          {material.period_start && material.period_end && (
            <span>{(material.period_start || '').slice(0, 10)} ~ {(material.period_end || '').slice(0, 10)}</span>
          )}
        </div>
        <p>{truncateText(preview, 160)}</p>
      </button>
    </article>
  );
}

function KnowledgeFactCustomerCard({
  customerOverview,
  pinned,
  canMoveUp,
  canMoveDown,
  expanded,
  expandedProjectKeys,
  projectFacts,
  projectFactsLoading,
  onToggleCollapsed,
  onTogglePinned,
  onMoveUp,
  onMoveDown,
  onToggleProject,
  onLoadProjectFacts,
  onOpenFact,
}: {
  customerOverview: KnowledgeFactCustomerOverview;
  pinned: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  expanded: boolean;
  expandedProjectKeys: string[];
  projectFacts: Record<string, Fact[]>;
  projectFactsLoading: Record<string, boolean>;
  onToggleCollapsed: () => void;
  onTogglePinned: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleProject: (projectKey: string) => void;
  onLoadProjectFacts: (customerId: number | null, projectId: number | null) => void;
  onOpenFact: (fact: Fact) => void;
}) {
  const cid = customerOverview.customer_id;
  const latestDate = customerOverview.latest_fact_at
    ? formatDateTimeShort(customerOverview.latest_fact_at)
    : '';
  return (
    <section className="card-section accent-board material-group-card">
      <div className="section-heading board-group-heading">
        <button type="button" className="section-heading-main collapsible-heading" onClick={onToggleCollapsed}>
          <div className="section-heading-copy">
            <strong>{customerOverview.customer_name}</strong>
            <span>
              {customerOverview.project_count} 个项目 · {customerOverview.fact_count} 条事实
              {latestDate ? <> · {latestDate}</> : null}
            </span>
          </div>
        </button>
        <div className="section-heading-side">
          <span className="group-actions-inline">
            <button
              type="button"
              className="mini-icon-button project-group-action-button project-group-action-button-up"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              aria-label={`上移客户 ${customerOverview.customer_name}`}
            >
              <MoveArrowIcon direction="up" />
            </button>
            <button
              type="button"
              className="mini-icon-button project-group-action-button project-group-action-button-down"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              aria-label={`下移客户 ${customerOverview.customer_name}`}
            >
              <MoveArrowIcon direction="down" />
            </button>
            <button
              type="button"
              className={pinned
                ? 'mini-icon-button mini-icon-button-active project-group-action-button project-group-action-button-pin'
                : 'mini-icon-button project-group-action-button project-group-action-button-pin project-group-action-button-pin-inactive'}
              onClick={onTogglePinned}
              aria-label={pinned ? `取消置顶客户 ${customerOverview.customer_name}` : `置顶客户 ${customerOverview.customer_name}`}
            >
              {pinned ? <PinIcon active /> : <PinIcon active={false} />}
            </button>
          </span>
          <button type="button" className="section-toggle-icon-button" onClick={onToggleCollapsed} aria-label={expanded ? `折叠 ${customerOverview.customer_name}` : `展开 ${customerOverview.customer_name}`}>
            <span className="section-toggle-icon">{expanded ? '−' : '+'}</span>
          </button>
        </div>
      </div>
      {expanded && (
        <div className="material-list">
          {customerOverview.projects.map((proj) => {
            const projKey = `${cid ?? 'none'}:${proj.project_id ?? 'unassigned'}`;
            const factsList = projectFacts[projKey] || [];
            const loading = projectFactsLoading[projKey] || false;
            const projExpanded = expandedProjectKeys.includes(projKey);
            const projLatest = proj.latest_fact_at
              ? formatDateTimeShort(proj.latest_fact_at)
              : '';
            return (
              <div key={projKey} className="knowledge-project-group">
                <button
                  type="button"
                  className="knowledge-project-header"
                  onClick={() => {
                    onToggleProject(projKey);
                    if (!projExpanded && factsList.length === 0) {
                      onLoadProjectFacts(cid, proj.project_id);
                    }
                  }}
                >
                  <div className="knowledge-project-header-copy">
                    <strong>{proj.project_name}</strong>
                    <span>
                      {proj.fact_count} 条事实
                      {projLatest ? <> · {projLatest}</> : null}
                    </span>
                  </div>
                  <span className="collapse-indicator">{projExpanded ? '⌃' : '⌄'}</span>
                </button>
                {projExpanded && (
                  <div className="knowledge-project-facts">
                    {loading ? (
                      <StateCard text="加载事实中…" />
                    ) : factsList.length === 0 ? (
                      <div className="helper-text">这个项目暂无匹配状态的事实</div>
                    ) : (
                      factsList.map((fact) => (
                        <FactRow key={fact.id} fact={fact} onOpen={() => onOpenFact(fact)} />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FactCustomerGroupSection({
  title,
  facts,
  onOpen,
}: {
  title: string;
  facts: Fact[];
  onOpen: (fact: Fact) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="card-section accent-board material-group-card">
      <div className="section-heading board-group-heading">
        <button type="button" className="section-heading-main collapsible-heading" onClick={() => setCollapsed((prev) => !prev)}>
          <div className="section-heading-copy">
            <strong>{title}</strong>
            <span>本组 {facts.length} 条事实</span>
          </div>
          <span className="collapse-indicator">{collapsed ? '⌄' : '⌃'}</span>
        </button>
      </div>
      {!collapsed && (
        <div className="material-list">
          {facts.map((fact) => (
            <FactRow key={fact.id} fact={fact} onOpen={() => onOpen(fact)} />
          ))}
        </div>
      )}
    </section>
  );
}

function FactRow({ fact, onOpen }: { fact: Fact; onOpen: () => void }) {
  const preview = fact.raw_markdown || '暂无正文';
  return (
    <article className="material-row fact-row">
      <button type="button" className="material-row-main" onClick={onOpen}>
        <div className="material-row-title-line">
          <strong>{fact.title || '（无标题）'}</strong>
          <FactStatusPill status={fact.status} />
        </div>
        <div className="material-row-meta">
          {fact.fact_date && <span>{(fact.fact_date || '').slice(0, 10)}</span>}
          {fact.source_type && <span>{fact.source_type}</span>}
          {fact.task_id != null && <span>任务 #{fact.task_id}</span>}
        </div>
        {fact.value_types.length > 0 && (
          <div className="material-value-types">
            {fact.value_types.map((type) => <span key={type}>{type}</span>)}
          </div>
        )}
        <p>{truncateText(preview, 140)}</p>
      </button>
    </article>
  );
}

function FactStatusPill({ status }: { status: FactStatus }) {
  return <span className={`material-status-pill material-status-${status}`}>{factStatusLabelMap[status]}</span>;
}

function CompactFactRow({
  fact,
  customerName,
  onOpen,
}: {
  fact: Fact;
  customerName: string | null;
  onOpen: () => void;
}) {
  return (
    <article className="material-row material-row-compact fact-row task-fact-row">
      <button type="button" className="material-row-main task-fact-row-main" onClick={onOpen}>
        <div className="task-fact-row-line">
          <strong className="task-fact-row-title">{fact.title || '（无标题）'}</strong>
          <FactStatusPill status={fact.status} />
        </div>
        <div className="task-fact-row-meta">
          {customerName && <span>{customerName}</span>}
          {fact.fact_date && <span>{(fact.fact_date || '').slice(0, 10)}</span>}
        </div>
      </button>
    </article>
  );
}

function MaterialRow({
  material,
  compact = false,
  onOpen,
}: {
  material: CustomerMaterial;
  compact?: boolean;
  onOpen: () => void;
}) {
  const preview = material.raw_facts_markdown || '暂无正文';
  const period = material.period_start && material.period_end
    ? `${(material.period_start || '').slice(0, 10)} ~ ${(material.period_end || '').slice(0, 10)}`
    : formatDateTime(material.material_date || material.updated_at);
  return (
    <article className={compact ? 'material-row material-row-compact' : 'material-row'}>
      <button type="button" className="material-row-main" onClick={onOpen}>
        <div className="material-row-title-line">
          <strong>{material.title}</strong>
          <MaterialStatusPill status={material.status} />
        </div>
        <div className="material-row-meta">
          <span>{period}</span>
          {material.task_id != null && <span>任务 #{material.task_id}</span>}
        </div>
        <p>{truncateText(preview, compact ? 80 : 160)}</p>
      </button>
    </article>
  );
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
  materials,
  materialsLoading,
  facts,
  factsLoading,
  customerMap,
  busyAction,
  onClose,
  onAction,
  onEdit,
  onEditMaterial,
  onOpenFact,
}: {
  task: Task;
  loading: boolean;
  materials: CustomerMaterial[];
  materialsLoading: boolean;
  facts: Fact[];
  factsLoading: boolean;
  customerMap: Map<number, Customer>;
  busyAction: string | null;
  onClose: () => void;
  onAction: (type: TaskActionType) => void;
  onEdit: () => void;
  onEditMaterial: (material: CustomerMaterial) => void;
  onOpenFact: (factId: number) => void;
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
              {task.source_type && <DetailItem label="来源" value={String(task.source_type)} />}
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
            <div className="detail-label">客户材料</div>
            {materialsLoading ? (
              <div className="helper-text">客户材料加载中…</div>
            ) : materials.length === 0 ? (
              <div className="helper-text">暂无关联客户材料。客户事实会在周日 20:00 自动聚合成周期材料。</div>
            ) : (
              <div className="material-list compact-material-list">
                {materials.map((material) => (
                  <MaterialRow
                    key={material.id}
                    material={material}
                    compact
                    onOpen={() => onEditMaterial(material)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="detail-card">
            <div className="detail-label">客户事实</div>
            {factsLoading ? (
              <div className="helper-text">客户事实加载中…</div>
            ) : facts.length === 0 ? (
              <div className="helper-text">暂无关联客户事实。客户事实由主代理在转发 / 截图 / 会议纪要场景写入。</div>
            ) : (
              <div className="material-list compact-material-list task-fact-list">
                {facts.map((fact) => (
                  <CompactFactRow
                    key={fact.id}
                    fact={fact}
                    customerName={fact.customer_id != null ? customerMap.get(fact.customer_id)?.name ?? null : null}
                    onOpen={() => onOpenFact(fact.id)}
                  />
                ))}
              </div>
            )}
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

function MaterialEditorSheet({
  draft,
  material,
  batch,
  customer,
  linkedFacts,
  factsLoading,
  onChange,
  onClose,
  onSubmit,
  onStatusChange,
  onArchive,
  onOpenFact,
  busy,
}: {
  draft: MaterialFormState;
  material: CustomerMaterial | null;
  batch: ReviewBatch | null;
  customer: Customer | null;
  linkedFacts: Fact[];
  factsLoading: boolean;
  onChange: (value: MaterialFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  onStatusChange: (status: CustomerMaterialStatus) => void;
  onArchive: () => void;
  onOpenFact: (factId: number) => void;
  busy: boolean;
}) {
  const period = batch?.period_start && batch?.period_end
    ? `${(batch.period_start || '').slice(0, 10)} ~ ${(batch.period_end || '').slice(0, 10)}`
    : (material?.period_start && material?.period_end
      ? `${(material.period_start || '').slice(0, 10)} ~ ${(material.period_end || '').slice(0, 10)}`
      : '—');
  return (
    <div className="overlay">
      <div className="sheet editor-sheet material-editor-sheet">
        <div className="sheet-header editor-sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>客户材料审核</strong>
          {material && <span className="muted-text">#{material.id}</span>}
        </div>

        <div className="editor-form">
          <section className="editor-hero-card material-editor-hero-card">
            <div className="editor-hero-copy">
              <span className="topbar-kicker editor-kicker">customer material</span>
              <h2>本批材料原文</h2>
              <p className="editor-card-note">由 cron 聚合本周期事实拼成；如有错别字、漏写可在此修正。简要纪要 / 洞察由 NotebookLM 上传后生成。</p>
            </div>
          </section>

          <section className="editor-card editor-card-primary">
            <div className="editor-grid editor-grid-two">
              <div className="editor-field">
                <span className="editor-label">客户</span>
                <div className="editor-readonly">{customer?.name || '—'}</div>
              </div>
              <div className="editor-field">
                <span className="editor-label">项目</span>
                <div className="editor-readonly">{material?.project || '—'}</div>
              </div>
              <div className="editor-field">
                <span className="editor-label">周期</span>
                <div className="editor-readonly">{period}</div>
              </div>
              <div className="editor-field">
                <span className="editor-label">类型</span>
                <div className="editor-readonly">
                  {material?.material_type
                    ? (materialTypeLabelMap[material.material_type] || material.material_type)
                    : '—'}
                </div>
              </div>
              <div className="editor-field">
                <span className="editor-label">材料状态</span>
                <div className="editor-readonly">{materialStatusLabelMap[draft.status]}</div>
              </div>
              <div className="editor-field">
                <span className="editor-label">更新于</span>
                <div className="editor-readonly">{material ? formatDateTime(material.updated_at) : '—'}</div>
              </div>
            </div>

            <label className="editor-field editor-field-title">
              <span className="editor-label">材料标题</span>
              <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="例如：佰世赛｜客户级｜2026-04-27 ~ 2026-05-03" />
            </label>
          </section>

          <section className="editor-card editor-card-soft">
            <label className="editor-field editor-field-description">
              <span className="editor-label">原始事实 Markdown</span>
              <textarea rows={16} value={draft.raw_facts_markdown} onChange={(event) => onChange({ ...draft, raw_facts_markdown: event.target.value })} placeholder="按 fact_date 排序后的原文拼接。审核时只做错别字 / 漏写修正。" />
            </label>
          </section>

          <section className="editor-card editor-card-soft material-facts-panel">
            <div className="editor-label">本批材料关联的事实</div>
            {factsLoading ? (
              <div className="helper-text">关联事实加载中…</div>
            ) : linkedFacts.length === 0 ? (
              <div className="helper-text">暂无关联事实</div>
            ) : (
              <div className="material-list compact-material-list">
                {linkedFacts.map((fact) => (
                  <article key={fact.id} className="material-row material-row-compact fact-row">
                    <button type="button" className="material-row-main" onClick={() => onOpenFact(fact.id)}>
                      <div className="material-row-title-line">
                        <strong>{fact.title || '（无标题）'}</strong>
                        <FactStatusPill status={fact.status} />
                      </div>
                      <div className="material-row-meta">
                        {fact.fact_date && <span>{(fact.fact_date || '').slice(0, 10)}</span>}
                        {fact.source_type && <span>{fact.source_type}</span>}
                      </div>
                      <p>{truncateText(fact.raw_markdown, 80)}</p>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="editor-submit-bar material-editor-actions">
          <button type="button" className="primary-submit editor-submit-button" onClick={onSubmit} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
          <button type="button" className="action-button" onClick={() => onStatusChange('approved')} disabled={busy || draft.status === 'approved'}>
            通过
          </button>
          <button type="button" className="action-button" onClick={() => onStatusChange('skipped')} disabled={busy || draft.status === 'skipped'}>
            跳过
          </button>
          <button type="button" className="action-button action-danger" onClick={onArchive} disabled={busy}>
            归档
          </button>
        </div>
      </div>
    </div>
  );
}

function FactEditorSheet({
  draft,
  fact,
  customer,
  onChange,
  onClose,
  onSubmit,
  onStatusChange,
  onDelete,
  onOpenTask,
  onOpenCustomerPicker,
  busy,
}: {
  draft: FactFormState;
  fact: Fact | null;
  customer: Customer | null;
  onChange: (value: FactFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  onStatusChange: (status: FactStatus) => void;
  onDelete: () => void;
  onOpenTask: (taskId: number) => void;
  onOpenCustomerPicker: () => void;
  busy: boolean;
}) {
  const toggleValueType = (valueType: string) => {
    const active = draft.value_types.includes(valueType);
    onChange({
      ...draft,
      value_types: active ? draft.value_types.filter((item) => item !== valueType) : [...draft.value_types, valueType],
    });
  };
  return (
    <div className="overlay">
      <div className="sheet editor-sheet material-editor-sheet fact-editor-sheet">
        <div className="sheet-header editor-sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>客户事实</strong>
          {fact && <span className="muted-text">#{fact.id}</span>}
        </div>

        <div className="editor-form">
          <section className="editor-hero-card material-editor-hero-card">
            <div className="editor-hero-copy">
              <span className="topbar-kicker editor-kicker">customer fact</span>
              <h2>事实原文</h2>
              <p className="editor-card-note">raw_markdown 是事实唯一正文。审核时只做错别字 / 漏写修正。</p>
            </div>
          </section>

          <section className="editor-card editor-card-primary">
            <div className="editor-grid editor-grid-two">
              <div className="editor-field">
                <span className="editor-label">客户</span>
                <button
                  type="button"
                  className="editor-readonly editor-pickable"
                  onClick={onOpenCustomerPicker}
                  disabled={busy}
                  aria-label="修改关联客户"
                >
                  <span className="editor-pickable-value">{customer?.name || '— 选择客户'}</span>
                  <span className="editor-pickable-glyph" aria-hidden="true">›</span>
                </button>
              </div>
              <div className="editor-field">
                <span className="editor-label">关联任务</span>
                <div className="editor-readonly">
                  {fact?.task_id != null ? (
                    <button type="button" className="link-button" onClick={() => onOpenTask(fact.task_id as number)}>
                      任务 #{fact.task_id} →
                    </button>
                  ) : '—'}
                </div>
              </div>
            </div>

            <label className="editor-field editor-field-title">
              <span className="editor-label">事实标题</span>
              <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="例如：客户反馈 xxx" />
            </label>

            <div className="editor-grid editor-grid-two">
              <label className="editor-field">
                <span className="editor-label">事实时间</span>
                <input type="datetime-local" value={draft.fact_date} onChange={(event) => onChange({ ...draft, fact_date: event.target.value })} />
              </label>
              <label className="editor-field">
                <span className="editor-label">状态</span>
                <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as FactStatus })}>
                  {(Object.keys(factStatusLabelMap) as FactStatus[]).map((status) => (
                    <option key={status} value={status}>{factStatusLabelMap[status]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="editor-field">
              <span className="editor-label">价值类型</span>
              <div className="option-chip-grid material-value-chip-grid">
                {factValueTypeOptions.map((option) => (
                  <button key={option} type="button" className={draft.value_types.includes(option) ? 'chip chip-active' : 'chip'} onClick={() => toggleValueType(option)}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="editor-card editor-card-soft">
            <label className="editor-field editor-field-description">
              <span className="editor-label">事实原文 Markdown</span>
              <textarea rows={14} value={draft.raw_markdown} onChange={(event) => onChange({ ...draft, raw_markdown: event.target.value })} placeholder="保留客户原话、转写、证据截图描述。" />
            </label>
          </section>
        </div>

        <div className="editor-submit-bar material-editor-actions">
          <button type="button" className="primary-submit editor-submit-button" onClick={onSubmit} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
          {draft.status !== 'confirmed' && (
            <button type="button" className="action-button" onClick={() => onStatusChange('confirmed')} disabled={busy}>
              标为已确认
            </button>
          )}
          {draft.status !== 'draft' && (
            <button type="button" className="action-button" onClick={() => onStatusChange('draft')} disabled={busy}>
              标为草稿
            </button>
          )}
          {draft.status !== 'rejected' && (
            <button type="button" className="action-button" onClick={() => onStatusChange('rejected')} disabled={busy}>
              标为驳回
            </button>
          )}
          <button type="button" className="action-button action-danger" onClick={onDelete} disabled={busy}>
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function FactCustomerPickerSheet({
  customers,
  currentCustomerId,
  busy,
  onClose,
  onSelect,
}: {
  customers: Customer[];
  currentCustomerId: number | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (customerId: number | null) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = customers.filter((c) => !c.status || c.status === 'active' || c.id === currentCustomerId);
    if (!q) return visible;
    return visible.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.area && c.area.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [customers, currentCustomerId, query]);

  return (
    <div className="overlay">
      <div className="sheet filter-sheet customer-picker-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>选择客户</strong>
          <span className="muted-text">{filtered.length} 项</span>
        </div>
        <div className="customer-picker-search">
          <span className="board-search-icon" aria-hidden="true">⌕</span>
          <input
            className="board-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索客户名称 / 区域"
            autoFocus
          />
          {query ? (
            <button type="button" className="board-search-clear" onClick={() => setQuery('')} aria-label="清空搜索">×</button>
          ) : null}
        </div>
        <div className="customer-picker-list">
          <button
            type="button"
            className={currentCustomerId == null ? 'customer-picker-row customer-picker-row-active' : 'customer-picker-row'}
            onClick={() => onSelect(null)}
            disabled={busy}
          >
            <strong>未关联</strong>
            <span className="muted-text">清空当前客户</span>
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === currentCustomerId ? 'customer-picker-row customer-picker-row-active' : 'customer-picker-row'}
              onClick={() => onSelect(c.id)}
              disabled={busy}
            >
              <strong>{c.name}</strong>
              {c.area && <span className="muted-text">{c.area}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="helper-text customer-picker-empty">没有匹配的客户</div>
          )}
        </div>
      </div>
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

function SettingsSheet({
  theme,
  timeFormat,
  boardContentMaxLength,
  onClose,
  onThemeChange,
  onTimeFormatChange,
  onBoardContentMaxLengthChange,
}: {
  theme: ThemeMode;
  timeFormat: TimeFormatMode;
  boardContentMaxLength: number;
  onClose: () => void;
  onThemeChange: (value: ThemeMode) => void;
  onTimeFormatChange: (value: TimeFormatMode) => void;
  onBoardContentMaxLengthChange: (value: number) => void;
}) {
  return (
    <div className="overlay">
      <div className="sheet filter-sheet settings-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>关闭</button>
          <strong>设置</strong>
          <span className="muted-text">移动端</span>
        </div>
        <div className="settings-panel">
          <section className="settings-card">
            <div className="settings-card-copy">
              <span className="label-caption">主题</span>
              <strong>外观模式</strong>
              <p className="muted-text">白天看清楚，晚上别刺眼。</p>
            </div>
            <div className="settings-theme-row" role="tablist" aria-label="外观模式">
              <button type="button" className={theme === 'light' ? 'board-segment board-segment-active' : 'board-segment'} onClick={() => onThemeChange('light')}>日间</button>
              <button type="button" className={theme === 'dark' ? 'board-segment board-segment-active' : 'board-segment'} onClick={() => onThemeChange('dark')}>夜间</button>
            </div>
          </section>

          <label className="settings-card settings-field-card">
            <span className="label-caption">时间显示</span>
            <select value={timeFormat} onChange={(event) => onTimeFormatChange(event.target.value as TimeFormatMode)}>
              {timeFormatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} · {option.sample}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-card settings-field-card">
            <span className="label-caption">看板内容最大显示字符数</span>
            <input
              type="number"
              min={BOARD_CONTENT_MAX_MIN}
              max={BOARD_CONTENT_MAX_LIMIT}
              step={5}
              value={boardContentMaxLength}
              onChange={(event) => onBoardContentMaxLengthChange(Number(event.target.value))}
            />
            <span className="muted settings-helper-text">默认 {BOARD_CONTENT_MAX_DEFAULT}，允许 {BOARD_CONTENT_MAX_MIN} - {BOARD_CONTENT_MAX_LIMIT}，会自动保存。</span>
          </label>
        </div>
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
