import { CustomerMaterial, CustomerMaterialStatus, Fact, FactStatus, Reminder, ReminderDeliveryMode, ReminderReceiveIdType, Task, TaskRecurrence, TaskStatus } from '../types';
import { APP_TIME_ZONE, normalizeWeekdays } from '../utils';
import { formatDateTimeInput, toIsoOrNull } from './format';

export interface TaskFormState {
  title: string;
  due_at: string;
  project: string;
  project_id: number | null;
  description: string;
  status: TaskStatus;
  recurrence_enabled: boolean;
  recurrence_frequency: 'daily' | 'weekly' | 'monthly';
  recurrence_interval: string;
  recurrence_weekdays: number[];
  recurrence_month_day: string;
  recurrence_until: string;
}

export interface ReminderFormState {
  id: number | null;
  remind_at: string;
  delivery_mode: ReminderDeliveryMode;
  receive_id: string;
  receive_id_type: ReminderReceiveIdType;
  note: string;
  ai_prompt: string;
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
    project_id: task?.project_id ?? null,
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

export function getPrimaryReminder(task?: Task | null): Reminder | null {
  const reminders = [...(task?.reminders || [])].filter((reminder) => reminder.status !== 'canceled');
  if (!reminders.length) return null;
  return reminders.sort((a, b) => String(a.remind_at).localeCompare(String(b.remind_at)))[0];
}

export function buildDefaultAiPrompt(task: Task, remindAt: string): string {
  const lines = [
    '你是 TaskCenter 定时提醒助手。',
    '',
    '请在到点后发送一条简洁中文提醒给南哥。不要扩写，不要引入额外事实。',
    '',
    '任务信息：',
    `- task_center #${task.id}`,
    `- 标题：${task.title}`,
    `- 计划时间：${remindAt || '未设置'}`,
    `- 状态：${task.status}`,
  ];
  if (task.project) lines.push(`- 项目：${task.project}`);
  if (task.description) lines.push(`- 备注：${task.description}`);
  lines.push('', '请输出一条适合飞书发送的提醒。');
  return lines.join('\n');
}

export function makeReminderFormState(task: Task): ReminderFormState {
  const reminder = getPrimaryReminder(task);
  const remindAt = formatDateTimeInput(reminder?.remind_at || getTaskScheduleAt(task) || '');
  const mode = (reminder?.delivery_mode || 'feishu_card_v2') as ReminderDeliveryMode;
  return {
    id: reminder?.id ?? null,
    remind_at: remindAt,
    delivery_mode: mode,
    receive_id: reminder?.receive_id || '',
    receive_id_type: (reminder?.receive_id_type || 'open_id') as ReminderReceiveIdType,
    note: reminder?.note || '',
    ai_prompt: reminder?.ai_prompt || buildDefaultAiPrompt(task, remindAt),
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
