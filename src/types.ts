import type { components } from './api/generated';

// ---------------------------------------------------------------------------
// Schema aliases — single source of truth is now openapi-typescript codegen.
// The normalize layer in api.ts still performs runtime safety conversions;
// these types are the *target shape* after normalization.
// ---------------------------------------------------------------------------

type Schemas = components['schemas'];

// --- Enums / union aliases (kept explicit for readability in App.tsx) ------
export type TaskStatus = 'todo' | 'doing' | 'done' | 'deferred' | 'canceled';
export type TaskSource = 'chat' | 'web' | 'system' | 'seed' | string;
export type TaskSourceType =
  | 'forwarded_message'
  | 'screenshot'
  | 'meeting_note'
  | 'user_chat'
  | 'manual_input'
  | string;
export type RecurrenceFrequency = Schemas['TaskRecurrenceRead']['frequency'];
export type CustomerMaterialStatus = 'pending' | 'approved' | 'skipped' | 'uploaded';
export type ReviewBatchStatus = 'pending' | 'partial' | 'approved' | 'uploaded' | string;
export type FactStatus = 'draft' | 'confirmed' | 'rejected';
export type ReminderDeliveryMode = 'feishu_card_v2' | 'feishu_card_v1' | 'openclaw_cron_agent';
export type ReminderStatus = 'scheduled' | 'fired' | 'canceled' | 'failed' | 'disabled';
export type ReminderReceiveIdType = 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';

// --- Read models (backend → frontend) -------------------------------------
export type Reminder = Schemas['ReminderRead'] & {
  delivery_mode?: ReminderDeliveryMode | null;
  receive_id?: string | null;
  receive_id_type?: ReminderReceiveIdType | null;
  external_cron_job_id?: string | null;
  message_id?: string | null;
  request_uuid?: string | null;
  fired_at?: string | null;
  last_error?: string | null;
  retry_count?: number;
  ai_prompt?: string | null;
  status: ReminderStatus | string;
};
export type TaskRecurrenceRead = Schemas['TaskRecurrenceRead'];
export type TaskRecurrence = Schemas['TaskRecurrenceWrite'] & {
  id?: number;
  task_id?: number;
  next_run_at?: string | null;
  last_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
};
export type TaskEvent = Schemas['TaskEventRead'];
export type Task = Omit<Schemas['TaskDetail'], 'status' | 'recurrence' | 'reminders'> & {
  status: TaskStatus;
  recurrence?: TaskRecurrence | null;
  reminders: Reminder[];
};
export type CustomerMaterial = Omit<Schemas['CustomerMaterialRead'], 'status' | 'project' | 'source_type' | 'source' | 'source_refs' | 'value_types' | 'task_id'> & { status: CustomerMaterialStatus };
export type CustomerMaterialFact = Schemas['CustomerMaterialFactRead'];
export type ReviewBatch = Schemas['ReviewBatchRead'];
export type Customer = Schemas['CustomerRead'];
export type Fact = Omit<Schemas['FactRead'], 'status'> & { status: FactStatus };
export type ProjectSummary = Schemas['ProjectSummary'];
export type Project = Schemas['ProjectRead'];
export type KnowledgeFactProjectOverview = Schemas['KnowledgeFactProjectOverview'];
export type KnowledgeFactCustomerOverview = Schemas['KnowledgeFactCustomerOverview'];
export type KnowledgeFactsOverview = Schemas['KnowledgeFactsOverview'];
export type KnowledgePreferences = {
  pinned_customer_ids: number[];
  customer_order_ids: number[];
};
export type BoardPreferences = {
  task_order: number[];
  pinned_projects: string[];
  project_order: string[];
};

// --- Frontend-only composite types ----------------------------------------

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

export interface HistoryResponse {
  items: Task[];
  total: number;
}

// --- Filter / query types (frontend-only) ---------------------------------

export interface TaskFilters {
  date?: string;
  status?: string;
  q?: string;
}

export interface CustomerMaterialFilters {
  customer_id?: number;
  project_v2_id?: number;
  review_batch_id?: number;
  material_type?: string;
  q?: string;
  status?: CustomerMaterialStatus | '';
  include_archived?: boolean;
  limit?: number;
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

// --- Mutation payloads (frontend → backend) --------------------------------

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  due_at?: string | null;
  status?: TaskStatus;
  project?: string | null;
  project_id?: number | null;
  area?: string | null;
  source_type?: TaskSourceType | null;
  tags?: string[];
  recurrence?: TaskRecurrence | null;
}

export interface ReminderPayload {
  remind_at: string;
  channel?: string;
  note?: string | null;
  delivery_mode?: ReminderDeliveryMode | null;
  receive_id?: string | null;
  receive_id_type?: ReminderReceiveIdType | null;
  ai_prompt?: string | null;
}

export interface UpdateReminderPayload {
  remind_at?: string;
  channel?: string | null;
  note?: string | null;
  delivery_mode?: ReminderDeliveryMode | null;
  receive_id?: string | null;
  receive_id_type?: ReminderReceiveIdType | null;
  ai_prompt?: string | null;
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

export interface UpdateCustomerMaterialPayload {
  title?: string;
  status?: CustomerMaterialStatus;
  raw_facts_markdown?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  material_type?: string | null;
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
