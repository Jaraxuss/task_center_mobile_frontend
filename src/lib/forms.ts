import { CustomerMaterial, CustomerMaterialStatus, Fact, FactStatus, Task, TaskRecurrence, TaskStatus } from '../types';
import { APP_TIME_ZONE, normalizeWeekdays } from '../utils';
import { formatDateTimeInput, toIsoOrNull } from './format';

export interface TaskFormState {
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

export interface MaterialFormState {
  id: number;
  title: string;
  raw_facts_markdown: string;
  status: CustomerMaterialStatus;
}

export interface FactFormState {
  id: number;
  title: string;
  raw_markdown: string;
  fact_date: string;
  status: FactStatus;
  value_types: string[];
}

export function getTaskScheduleAt(task?: Task | null) {
  if (!task) return null;
  return task.deferred_to || task.due_at || null;
}

export function makeTaskFormState(task?: Task | null): TaskFormState {
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

export function makeMaterialFormState(material: CustomerMaterial): MaterialFormState {
  return {
    id: material.id,
    title: material.title || '',
    raw_facts_markdown: material.raw_facts_markdown || '',
    status: material.status || 'pending',
  };
}

export function makeFactFormState(fact: Fact): FactFormState {
  return {
    id: fact.id,
    title: fact.title || '',
    raw_markdown: fact.raw_markdown || '',
    fact_date: formatDateTimeInput(fact.fact_date || ''),
    status: fact.status || 'draft',
    value_types: [...(fact.value_types || [])],
  };
}

export function buildRecurrencePayload(draft: TaskFormState, dueAt: string | null): TaskRecurrence | null {
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
