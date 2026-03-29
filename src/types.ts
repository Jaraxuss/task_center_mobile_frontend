export type TaskStatus = 'todo' | 'doing' | 'done' | 'deferred' | 'canceled';
export type TaskSource = 'chat' | 'web' | 'system' | 'seed' | string;
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | string;

export interface Reminder {
  id: number;
  task_id: number;
  remind_at: string;
  channel: string;
  status: 'scheduled' | 'fired' | 'canceled';
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRecurrence {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  interval: number;
  days_of_week?: number[];
  day_of_month?: number | null;
  end_at?: string | null;
  timezone?: string | null;
  time_of_day?: string | null;
  start_at?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  reminder_offsets_minutes?: number[];
}

export interface TaskEvent {
  id: number;
  task_id: number;
  event_type: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string | null;
  due_at?: string | null;
  status: TaskStatus;
  project?: string | null;
  tags: string[];
  source?: TaskSource;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  canceled_at?: string | null;
  deferred_to?: string | null;
  reminders?: Reminder[];
  recurrence?: TaskRecurrence | null;
  events?: TaskEvent[];
}

export interface PlanGroup {
  key: string;
  title: string;
  group_date?: string | null;
  tasks: Task[];
}

export interface DashboardToday {
  date: string;
  summary: {
    total: number;
    dueToday: number;
    overdue: number;
    completed: number;
    open: number;
  };
  tasks: Task[];
  planGroups: PlanGroup[];
}

export interface DashboardBoardGroup {
  key: string;
  title: string;
  status?: TaskStatus;
  tasks: Task[];
}

export interface DashboardBoard {
  groups: DashboardBoardGroup[];
}

export interface ProjectSummary {
  name: string;
  task_count: number;
  open_task_count: number;
  done_task_count: number;
}

export interface HistoryResponse {
  items: Task[];
  total: number;
}

export interface TaskFilters {
  date?: string;
  status?: string;
  q?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  due_at?: string | null;
  status?: TaskStatus;
  project?: string | null;
  tags?: string[];
  recurrence?: TaskRecurrence | null;
}

export interface DeferTaskPayload {
  deferred_to: string;
  due_at?: string;
  reason?: string;
}
