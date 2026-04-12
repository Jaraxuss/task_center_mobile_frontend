import { API_BASE_URL } from './config';
import {
  DashboardBoard,
  DashboardPlan,
  DashboardToday,
  DeferTaskPayload,
  HistoryResponse,
  ProjectSummary,
  Task,
  TaskEvent,
  TaskFilters,
  TaskRecurrence,
  TaskStatus,
  UpdateTaskPayload,
} from './types';
import { currentDateKey } from './utils';

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
    tags: Array.isArray(task.tags) ? task.tags : [],
    source: task.source,
    created_at: task.created_at,
    updated_at: task.updated_at,
    completed_at: task.completed_at ?? null,
    canceled_at: task.canceled_at ?? null,
    deferred_to: task.deferred_to ?? null,
    reminders: Array.isArray(task.reminders)
      ? task.reminders.map((reminder: any) => ({ ...reminder, id: Number(reminder.id), task_id: Number(reminder.task_id) }))
      : [],
    recurrence: normalizeRecurrence(task),
    events: Array.isArray(task.events) ? task.events.map(normalizeEvent) : [],
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
    const overdue = tasks.filter((task: Task) => task.status !== 'done' && task.status !== 'canceled' && task.due_at && new Date(task.due_at).getTime() < now).length;
    return {
      date: response.date || currentDateKey(),
      summary: {
        total: Number(response.total || tasks.length),
        dueToday: tasks.filter((task: Task) => task.due_at?.slice(0, 10) === (response.date || currentDateKey())).length,
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
  completeTask: async (id: number) =>
    normalizeTask(
      await request<any>(`/api/tasks/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({}),
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
