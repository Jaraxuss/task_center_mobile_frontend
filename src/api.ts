import { API_BASE_URL } from './config';
import {
  BoardPreferences,
  CompleteTaskPayload,
  Customer,
  CustomerMaterial,
  CustomerMaterialFact,
  CustomerMaterialFilters,
  CustomerMaterialStatus,
  DashboardBoard,
  DashboardPlan,
  DashboardToday,
  DeferTaskPayload,
  Fact,
  FactFilters,
  FactStatus,
  HistoryResponse,
  KnowledgeFactsOverview,
  KnowledgePreferences,
  ProjectSummary,
  ReviewBatch,
  Task,
  TaskEvent,
  TaskFilters,
  TaskRecurrence,
  TaskStatus,
  UpdateCustomerMaterialPayload,
  UpdateFactPayload,
  UpdateTaskPayload,
} from './types';
import { currentDateKey, getDateKey, toDateMillis } from './utils';

const boardTitles: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  deferred: '已延期',
  done: '已完成',
  canceled: '已取消',
};

function normalizeTaskStatus(status: unknown): TaskStatus {
  switch (status) {
    case 'todo':
    case 'doing':
    case 'done':
    case 'deferred':
    case 'canceled':
      return status;
    case 'open':
      return 'todo';
    case 'completed':
      return 'done';
    case 'cancelled':
      return 'canceled';
    default:
      return 'todo';
  }
}

function normalizeCustomerMaterialStatus(status: unknown): CustomerMaterialStatus {
  switch (status) {
    case 'approved':
    case 'skipped':
    case 'uploaded':
    case 'pending':
      return status;
    default:
      return 'pending';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      const detail = typeof payload?.detail === 'string' ? payload.detail : '';
      throw new Error(detail || `请求失败: ${response.status}`);
    }

    const text = await response.text();
    throw new Error(text || `请求失败: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function toSearchParams(filters?: TaskFilters) {
  const params = new URLSearchParams();
  if (!filters) return '';

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

function toMaterialSearchParams(filters?: CustomerMaterialFilters) {
  const params = new URLSearchParams();
  if (!filters) return '';

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

function toFactSearchParams(filters?: FactFilters) {
  const params = new URLSearchParams();
  if (!filters) return '';

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'boolean') {
      params.set(key, String(value));
      return;
    }
    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}

function normalizeEvent(event: Partial<TaskEvent> & { payload?: Record<string, unknown> }): TaskEvent {
  return {
    id: Number(event.id),
    task_id: Number(event.task_id),
    event_type: event.event_type || 'updated',
    payload: event.payload || {},
    created_at: event.created_at || new Date().toISOString(),
  };
}

function toNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item, index, list) => Number.isFinite(item) && list.indexOf(item) === index)
        .sort((a, b) => a - b)
    : [];
}

function normalizeRecurrence(raw: any): TaskRecurrence | null {
  const source = raw?.recurrence ?? raw?.recurrence_rule ?? raw?.repeat_rule ?? raw?.repeat ?? raw?.schedule ?? null;
  if (!source || typeof source !== 'object') return null;

  const enabled = source.enabled !== false;
  const rawFrequency = String(source.frequency || source.freq || source.unit || 'weekly').toLowerCase();
  const frequency = rawFrequency === 'day' ? 'daily' : rawFrequency === 'week' ? 'weekly' : rawFrequency === 'month' ? 'monthly' : rawFrequency;
  const interval = Math.max(1, Number(source.interval || source.every || 1) || 1);
  const daysOfWeek = toNumberArray(source.days_of_week ?? source.weekdays ?? source.week_days ?? source.byweekday);
  const dayOfMonthRaw = source.day_of_month ?? source.month_day ?? source.monthDay ?? source.bymonthday;
  const dayOfMonth = dayOfMonthRaw == null ? null : Number(dayOfMonthRaw);
  const reminderOffsets = toNumberArray(source.reminder_offsets_minutes ?? source.reminder_offset_minutes);

  return {
    enabled,
    frequency,
    interval,
    days_of_week: daysOfWeek,
    day_of_month: Number.isFinite(dayOfMonth) ? dayOfMonth : null,
    end_at: source.end_at ?? source.until ?? source.ends_at ?? null,
    timezone: source.timezone ?? source.tz ?? null,
    time_of_day: source.time_of_day ?? source.timeOfDay ?? source.time ?? null,
    start_at: source.start_at ?? source.anchor_at ?? source.starts_at ?? raw?.due_at ?? null,
    next_run_at: source.next_run_at ?? source.next_due_at ?? null,
    last_run_at: source.last_run_at ?? null,
    reminder_offsets_minutes: reminderOffsets,
  };
}

function normalizeTask(task: any): Task {
  return {
    id: Number(task.id),
    title: task.title,
    description: task.description ?? null,
    due_at: task.due_at ?? null,
    status: normalizeTaskStatus(task.status),
    project: task.project ?? null,
    area: task.area ?? null,
    customer_id: task.customer_id == null ? null : Number(task.customer_id),
    project_id: task.project_id == null ? null : Number(task.project_id),
    tags: Array.isArray(task.tags) ? task.tags : [],
    source: task.source,
    source_type: task.source_type ?? null,
    created_at: task.created_at,
    updated_at: task.updated_at,
    completed_at: task.completed_at ?? null,
    completion_note: task.completion_note ?? null,
    canceled_at: task.canceled_at ?? null,
    deferred_to: task.deferred_to ?? null,
    reminders: Array.isArray(task.reminders)
      ? task.reminders.map((reminder: any) => ({ ...reminder, id: Number(reminder.id), task_id: Number(reminder.task_id) }))
      : [],
    recurrence: normalizeRecurrence(task),
    events: Array.isArray(task.events) ? task.events.map(normalizeEvent) : [],
  };
}

function normalizeCustomerMaterial(material: any): CustomerMaterial {
  return {
    id: Number(material.id),
    title: String(material.title || ''),
    status: normalizeCustomerMaterialStatus(material.status),
    created_at: material.created_at || new Date().toISOString(),
    updated_at: material.updated_at || new Date().toISOString(),
    archived_at: material.archived_at ?? null,
    // v2 main fields
    raw_facts_markdown: material.raw_facts_markdown ?? null,
    customer_id: material.customer_id == null ? null : Number(material.customer_id),
    project_v2_id: material.project_v2_id == null ? null : Number(material.project_v2_id),
    review_batch_id: material.review_batch_id == null ? null : Number(material.review_batch_id),
    material_type: material.material_type ?? null,
    period_start: material.period_start ?? null,
    period_end: material.period_end ?? null,
    generation_meta:
      material.generation_meta && typeof material.generation_meta === 'object' && !Array.isArray(material.generation_meta)
        ? material.generation_meta
        : null,
    // legacy metadata fields
    project: material.project ?? null,
    material_date: material.material_date ?? null,
    source_type: material.source_type ? String(material.source_type) : undefined,
    source: material.source ? String(material.source) : undefined,
    source_refs: material.source_refs && typeof material.source_refs === 'object' && !Array.isArray(material.source_refs) ? material.source_refs : undefined,
    value_types: Array.isArray(material.value_types)
      ? material.value_types.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : undefined,
    task_id: material.task_id == null ? null : Number(material.task_id),
  };
}

function normalizeReviewBatch(batch: any): ReviewBatch {
  return {
    id: Number(batch.id),
    batch_type: String(batch.batch_type || ''),
    title: String(batch.title || ''),
    period_start: batch.period_start ?? null,
    period_end: batch.period_end ?? null,
    status: String(batch.status || 'pending'),
    material_count: Number(batch.material_count || 0),
    created_by: batch.created_by ?? null,
    created_at: batch.created_at || new Date().toISOString(),
    updated_at: batch.updated_at || new Date().toISOString(),
  };
}

function normalizeCustomer(customer: any): Customer {
  return {
    id: Number(customer.id),
    name: String(customer.name || ''),
    area: customer.area ?? null,
    status: customer.status ? String(customer.status) : undefined,
  };
}

function normalizeFactStatus(status: unknown): FactStatus {
  switch (status) {
    case 'draft':
    case 'confirmed':
    case 'rejected':
      return status;
    default:
      return 'draft';
  }
}

function normalizeFact(fact: any): Fact {
  return {
    id: Number(fact.id),
    title: String(fact.title || ''),
    raw_markdown: String(fact.raw_markdown || ''),
    fact_date: fact.fact_date ?? null,
    status: normalizeFactStatus(fact.status),
    source_type: String(fact.source_type || ''),
    value_types: Array.isArray(fact.value_types)
      ? fact.value_types.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [],
    customer_id: fact.customer_id == null ? null : Number(fact.customer_id),
    project_id: fact.project_id == null ? null : Number(fact.project_id),
    task_id: fact.task_id == null ? null : Number(fact.task_id),
    created_at: fact.created_at || new Date().toISOString(),
    updated_at: fact.updated_at || new Date().toISOString(),
  };
}

function normalizeMaterialFact(mf: any): CustomerMaterialFact {
  return {
    id: Number(mf.id),
    material_id: Number(mf.material_id),
    fact_id: Number(mf.fact_id),
    sort_order: Number(mf.sort_order || 0),
    created_at: mf.created_at || new Date().toISOString(),
  };
}

function serializeRecurrencePayload(recurrence?: TaskRecurrence | null) {
  if (!recurrence) return null;
  return {
    enabled: recurrence.enabled,
    frequency: recurrence.frequency,
    interval: Math.max(1, Number(recurrence.interval || 1) || 1),
    timezone: recurrence.timezone ?? 'Asia/Shanghai',
    time_of_day: recurrence.time_of_day ?? null,
    days_of_week: toNumberArray(recurrence.days_of_week),
    day_of_month: recurrence.day_of_month ?? null,
    start_at: recurrence.start_at ?? null,
    end_at: recurrence.end_at ?? null,
    reminder_offsets_minutes: toNumberArray(recurrence.reminder_offsets_minutes),
  };
}

export const api = {
  getTodayDashboard: async () => {
    const response = await request<any>('/api/dashboard/today');
    const tasks = Array.isArray(response.tasks) ? response.tasks.map(normalizeTask) : [];
    const now = Date.now();
    const completed = tasks.filter((task: Task) => task.status === 'done').length;
    const overdue = tasks.filter((task: Task) => task.status !== 'done' && task.status !== 'canceled' && task.due_at && toDateMillis(task.due_at) < now).length;
    return {
      date: response.date || currentDateKey(),
      summary: {
        total: Number(response.total || tasks.length),
        dueToday: tasks.filter((task: Task) => getDateKey(task.due_at) === (response.date || currentDateKey())).length,
        overdue,
        completed,
        open: Number(response.open_count || tasks.filter((task: Task) => task.status !== 'done' && task.status !== 'canceled').length),
      },
      tasks,
      planGroups: Array.isArray(response.plan_groups)
        ? response.plan_groups.map((group: any) => ({
            key: String(group.key || group.group_date || group.title || 'plan-group'),
            title: String(group.title || group.group_date || '未安排'),
            group_date: group.group_date ?? null,
            tasks: Array.isArray(group.tasks) ? group.tasks.map(normalizeTask) : [],
          }))
        : [],
    } satisfies DashboardToday;
  },
  getPlanDashboard: async () => {
    const response = await request<any>('/api/dashboard/plan');
    return {
      date: response.date || currentDateKey(),
      total: Number(response.total || 0),
      open_count: Number(response.open_count || 0),
      planGroups: Array.isArray(response.plan_groups)
        ? response.plan_groups.map((group: any) => ({
            key: String(group.key || group.group_date || group.title || 'plan-group'),
            title: String(group.title || group.group_date || '未安排'),
            group_date: group.group_date ?? null,
            tasks: Array.isArray(group.tasks) ? group.tasks.map(normalizeTask) : [],
          }))
        : [],
    } satisfies DashboardPlan;
  },
  getBoardDashboard: async () => {
    const response = await request<any>('/api/dashboard/board');
    return {
      groups: Array.isArray(response.groups)
        ? response.groups.map((group: any) => {
            const status = normalizeTaskStatus(group.status);
            return {
              key: String(group.status ?? status),
              status,
              title: boardTitles[status] || String(group.status || status),
              tasks: Array.isArray(group.tasks) ? group.tasks.map(normalizeTask) : [],
            };
          })
        : [],
    } satisfies DashboardBoard;
  },
  getHistoryDashboard: async (filters?: TaskFilters) => {
    const response = await request<any>(`/api/history${toSearchParams(filters)}`);
    return {
      items: Array.isArray(response.tasks) ? response.tasks.map(normalizeTask) : [],
      total: Number(response.total || 0),
    } satisfies HistoryResponse;
  },
  getTask: async (id: number) => normalizeTask(await request<any>(`/api/tasks/${id}`)),
  getTasks: async (filters?: TaskFilters) => (await request<any[]>(`/api/tasks${toSearchParams(filters)}`)).map(normalizeTask),
  getCustomerMaterials: async (filters?: CustomerMaterialFilters) => (await request<any[]>(`/api/customer-materials${toMaterialSearchParams(filters)}`)).map(normalizeCustomerMaterial),
  getTaskCustomerMaterials: async (taskId: number) => (await request<any[]>(`/api/tasks/${taskId}/customer-materials`)).map(normalizeCustomerMaterial),
  updateCustomerMaterial: async (id: number, payload: UpdateCustomerMaterialPayload) =>
    normalizeCustomerMaterial(
      await request<any>(`/api/customer-materials/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    ),
  archiveCustomerMaterial: async (id: number) =>
    normalizeCustomerMaterial(
      await request<any>(`/api/customer-materials/${id}`, {
        method: 'DELETE',
      }),
    ),
  markMaterialUploaded: async (id: number) =>
    normalizeCustomerMaterial(
      await request<any>(`/api/customer-materials/${id}/mark-uploaded`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ),
  getMaterialFacts: async (materialId: number) =>
    (await request<any[]>(`/api/customer-materials/${materialId}/facts`)).map(normalizeMaterialFact),
  getReviewBatches: async () => (await request<any[]>(`/api/review-batches`)).map(normalizeReviewBatch),
  getReviewBatch: async (id: number) => normalizeReviewBatch(await request<any>(`/api/review-batches/${id}`)),
  getReviewBatchMaterials: async (id: number) =>
    (await request<any[]>(`/api/review-batches/${id}/customer-materials`)).map(normalizeCustomerMaterial),
  getCustomers: async () => (await request<any[]>(`/api/customers`)).map(normalizeCustomer),
  getFacts: async (filters?: FactFilters) => (await request<any[]>(`/api/facts${toFactSearchParams(filters)}`)).map(normalizeFact),
  getTaskFacts: async (taskId: number) =>
    (await request<any[]>(`/api/facts${toFactSearchParams({ task_id: taskId, limit: 100 })}`)).map(normalizeFact),
  getFact: async (id: number) => normalizeFact(await request<any>(`/api/facts/${id}`)),
  updateFact: async (id: number, payload: UpdateFactPayload) =>
    normalizeFact(
      await request<any>(`/api/facts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    ),
  deleteFact: async (id: number) => {
    await request<any>(`/api/facts/${id}`, { method: 'DELETE' });
  },
  getKnowledgeFactsOverview: async (filters?: { status?: FactStatus | '' }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return request<KnowledgeFactsOverview>(`/api/knowledge/facts/overview${qs ? `?${qs}` : ''}`);
  },
  getKnowledgePreferences: async () =>
    request<KnowledgePreferences>('/api/preferences/knowledge'),
  updateKnowledgePreferences: async (payload: Partial<KnowledgePreferences>) =>
    request<KnowledgePreferences>('/api/preferences/knowledge', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  createTask: async (payload: UpdateTaskPayload & { title: string }) =>
    normalizeTask(
      await request<any>(`/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: payload.title,
          description: payload.description ?? null,
          due_at: payload.due_at ?? null,
          project: payload.project ?? null,
          tags: payload.tags ?? [],
          source: 'web',
          reminders: [],
          recurrence: serializeRecurrencePayload(payload.recurrence),
        }),
      }),
    ),
  getProjects: async () => {
    const response = await request<any[]>('/api/projects');
    return (
      Array.isArray(response)
        ? response.map((project) => ({
            name: String(project.name || ''),
            task_count: Number(project.task_count || 0),
            open_task_count: Number(project.open_task_count || 0),
            done_task_count: Number(project.done_task_count || 0),
          }))
        : []
    ) satisfies ProjectSummary[];
  },
  getBoardPreferences: async () => {
    const response = await request<any>('/api/preferences/board');
    return {
      task_order: Array.isArray(response?.task_order) ? response.task_order.map((item: unknown) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0) : [],
      pinned_projects: Array.isArray(response?.pinned_projects)
        ? response.pinned_projects.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [],
      project_order: Array.isArray(response?.project_order)
        ? response.project_order.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [],
    } satisfies BoardPreferences;
  },
  updateBoardPreferences: async (payload: Partial<BoardPreferences>) => {
    const response = await request<any>('/api/preferences/board', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return {
      task_order: Array.isArray(response?.task_order) ? response.task_order.map((item: unknown) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0) : [],
      pinned_projects: Array.isArray(response?.pinned_projects)
        ? response.pinned_projects.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [],
      project_order: Array.isArray(response?.project_order)
        ? response.project_order.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [],
    } satisfies BoardPreferences;
  },
  updateTask: async (id: number, payload: UpdateTaskPayload) =>
    normalizeTask(
      await request<any>(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...payload,
          recurrence: serializeRecurrencePayload(payload.recurrence),
        }),
      }),
    ),
  completeTask: async (id: number, payload?: CompleteTaskPayload) =>
    normalizeTask(
      await request<any>(`/api/tasks/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }),
    ),
  deferTask: async (id: number, payload: DeferTaskPayload) =>
    normalizeTask(
      await request<any>(`/api/tasks/${id}/defer`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    ),
  cancelTask: async (id: number, reason?: string) =>
    normalizeTask(
      await request<any>(`/api/tasks/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
      }),
    ),
};
