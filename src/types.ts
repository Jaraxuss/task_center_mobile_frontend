export type TaskStatus = 'todo' | 'doing' | 'done' | 'deferred' | 'canceled';
export type TaskSource = 'chat' | 'web' | 'system' | 'seed' | string;
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | string;
export type CustomerMaterialStatus = 'pending' | 'approved' | 'skipped' | 'uploaded';

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
  completion_note?: string | null;
  canceled_at?: string | null;
  deferred_to?: string | null;
  reminders?: Reminder[];
  recurrence?: TaskRecurrence | null;
  events?: TaskEvent[];
}

export interface CustomerMaterial {
  id: number;
  project: string;
  title: string;
  material_date?: string | null;
  source_type: string;
  source: string;
  source_refs: Record<string, unknown>;
  raw_source_markdown?: string | null;
  candidate_markdown?: string | null;
  value_types: string[];
  status: CustomerMaterialStatus;
  review_note?: string | null;
  task_id?: number | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface CustomerMaterialFilters {
  project?: string;
  q?: string;
  status?: CustomerMaterialStatus | '';
  value_type?: string;
  task_id?: number;
  include_archived?: boolean;
  limit?: number;
}

export interface CustomerMaterialPayload {
  project: string;
  title: string;
  material_date?: string | null;
  source_type?: string;
  source?: string;
  source_refs?: Record<string, unknown>;
  raw_source_markdown?: string | null;
  candidate_markdown?: string | null;
  value_types?: string[];
  status?: CustomerMaterialStatus;
  review_note?: string | null;
  task_id?: number | null;
}

export type UpdateCustomerMaterialPayload = Partial<CustomerMaterialPayload> & { clear_task?: boolean };

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

export interface DashboardPlan {
  date: string;
  total: number;
  open_count: number;
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

export interface BoardPreferences {
  task_order: number[];
  pinned_projects: string[];
  project_order: string[];
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

export interface CompleteTaskPayload {
  completed_at?: string | null;
  note?: string;
}

export interface DeferTaskPayload {
  deferred_to: string;
  due_at?: string;
  reason?: string;
}
