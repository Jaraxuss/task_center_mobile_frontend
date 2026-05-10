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

// --- Read models (backend → frontend) -------------------------------------
export type Reminder = Schemas['ReminderRead'];
export type TaskRecurrence = Schemas['TaskRecurrenceRead'];
export type TaskEvent = Schemas['TaskEventRead'];
export type Task = Schemas['TaskDetail'];
export type CustomerMaterial = Schemas['CustomerMaterialRead'];
export type CustomerMaterialFact = Schemas['CustomerMaterialFactRead'];
export type ReviewBatch = Schemas['ReviewBatchRead'];
export type Customer = Schemas['CustomerRead'];
export type Fact = Schemas['FactRead'];
export type ProjectSummary = Schemas['ProjectSummary'];
export type KnowledgeFactProjectOverview = Schemas['KnowledgeFactProjectOverview'];
export type KnowledgeFactCustomerOverview = Schemas['KnowledgeFactCustomerOverview'];
export type KnowledgeFactsOverview = Schemas['KnowledgeFactsOverview'];
export type KnowledgePreferences = Schemas['KnowledgePreferenceRead'];
export type BoardPreferences = Schemas['BoardPreferenceRead'];

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
  project?: string;
  q?: string;
  status?: CustomerMaterialStatus | '';
  value_type?: string;
  task_id?: number;
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
