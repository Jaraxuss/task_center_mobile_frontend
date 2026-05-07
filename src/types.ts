export type TaskStatus = 'todo' | 'doing' | 'done' | 'deferred' | 'canceled';
export type TaskSource = 'chat' | 'web' | 'system' | 'seed' | string;
export type TaskSourceType =
  | 'forwarded_message'
  | 'screenshot'
  | 'meeting_note'
  | 'user_chat'
  | 'manual_input'
  | string;
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | string;
export type CustomerMaterialStatus = 'pending' | 'approved' | 'skipped' | 'uploaded';
export type ReviewBatchStatus = 'pending' | 'partial' | 'approved' | 'uploaded' | string;
export type FactStatus = 'draft' | 'confirmed' | 'rejected';

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
  area?: string | null;
  customer_id?: number | null;
  project_id?: number | null;
  tags: string[];
  source?: TaskSource;
  source_type?: TaskSourceType | null;
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
  title: string;
  status: CustomerMaterialStatus;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;

  // v2 main fields
  raw_facts_markdown?: string | null;
  customer_id?: number | null;
  project_v2_id?: number | null;
  review_batch_id?: number | null;
  material_type?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  generation_meta?: Record<string, unknown> | null;

  // legacy metadata fields (kept for backward display)
  project?: string | null;
  material_date?: string | null;
  source_type?: string;
  source?: string;
  source_refs?: Record<string, unknown>;
  value_types?: string[];
  task_id?: number | null;
}

export interface CustomerMaterialFilters {
  customer_id?: number;
  project_v2_id?: number;
  review_batch_id?: number;
  material_type?: string;
  project?: string;
  q?: string;
  status?: CustomerMaterialStatus | '';
  value_type?: string;
  task_id?: number;
  include_archived?: boolean;
  limit?: number;
}

export interface UpdateCustomerMaterialPayload {
  title?: string;
  status?: CustomerMaterialStatus;
  raw_facts_markdown?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  material_type?: string | null;
}

export interface ReviewBatch {
  id: number;
  batch_type: string;
  title: string;
  period_start?: string | null;
  period_end?: string | null;
  status: ReviewBatchStatus;
  material_count: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  name: string;
  area?: string | null;
  status?: string;
}

export interface Fact {
  id: number;
  title: string;
  raw_markdown: string;
  fact_date?: string | null;
  status: FactStatus;
  source_type: string;
  value_types: string[];
  customer_id?: number | null;
  project_id?: number | null;
  task_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface FactFilters {
  customer_id?: number;
  project_id?: number;
  project_unassigned?: boolean;
  task_id?: number;
  status?: FactStatus | '';
  source_type?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface UpdateFactPayload {
  title?: string;
  raw_markdown?: string;
  fact_date?: string | null;
  status?: FactStatus;
  value_types?: string[];
  customer_id?: number | null;
  project_id?: number | null;
  task_id?: number | null;
  clear_customer?: boolean;
  clear_project?: boolean;
  clear_task?: boolean;
}

export interface CustomerMaterialFact {
  id: number;
  material_id: number;
  fact_id: number;
  sort_order: number;
  created_at: string;
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
  area?: string | null;
  source_type?: TaskSourceType | null;
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

export interface KnowledgeFactProjectOverview {
  project_id: number | null;
  project_name: string;
  status?: string | null;
  fact_count: number;
  latest_fact_at?: string | null;
}

export interface KnowledgeFactCustomerOverview {
  customer_id: number | null;
  customer_name: string;
  area?: string | null;
  fact_count: number;
  project_count: number;
  latest_fact_at?: string | null;
  projects: KnowledgeFactProjectOverview[];
}

export interface KnowledgeFactsOverview {
  total_fact_count: number;
  customers: KnowledgeFactCustomerOverview[];
}

export interface KnowledgePreferences {
  pinned_customer_ids: number[];
  customer_order_ids: number[];
}
