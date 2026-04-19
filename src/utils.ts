import { PlanGroup, Task, TaskRecurrence, TaskStatus } from './types';

export const APP_TIME_ZONE = 'Asia/Shanghai';

export type TimeFormatMode = 'cn-short' | 'ymd-24' | 'slash-24';

const timeFormatOptions: Record<TimeFormatMode, Intl.DateTimeFormatOptions> = {
  'cn-short': { timeZone: APP_TIME_ZONE, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
  'ymd-24': { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
  'slash-24': { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
};

export function getTimeFormatMode(): TimeFormatMode {
  if (typeof document === 'undefined') return 'cn-short';
  const value = document.documentElement.dataset.timeFormat as TimeFormatMode | undefined;
  return value && value in timeFormatOptions ? value : 'cn-short';
}

export const statusLabelMap: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  deferred: '已延期',
  done: '已完成',
  canceled: '已取消',
};

const weekdayLabelMap: Record<number, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
};

function makeDatePartsFormatter() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getNaiveDateTimeParts(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  if (!match) return null;
  return {
    year: match[1],
    month: String(Number(match[2])),
    day: String(Number(match[3])),
    hour: match[4] || '00',
    minute: match[5] || '00',
    dateKey: `${match[1]}-${match[2]}-${match[3]}`,
  };
}

export function currentDateKey(date = new Date()) {
  const parts = makeDatePartsFormatter().formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

export function getDateKey(value?: string | null) {
  if (!value) return null;
  const naive = getNaiveDateTimeParts(value);
  if (naive) return naive.dateKey;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = makeDatePartsFormatter().formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function toDateMillis(value?: string | null) {
  if (!value) return Number.NaN;
  const naive = getNaiveDateTimeParts(value);
  if (naive) return new Date(`${naive.dateKey}T${naive.hour}:${naive.minute}:00+08:00`).getTime();
  return new Date(value).getTime();
}

export function formatDateTime(value?: string | null) {
  if (!value) return '未设置';
  const naive = getNaiveDateTimeParts(value);
  if (naive) return `${Number(naive.month)}/${Number(naive.day)} ${naive.hour}:${naive.minute}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const mode = getTimeFormatMode();

  if (mode === 'slash-24') {
    const parts = new Intl.DateTimeFormat('en-CA', timeFormatOptions[mode]).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
  }

  return new Intl.DateTimeFormat('zh-CN', timeFormatOptions[mode]).format(date);
}

export function formatDateTimeShort(value?: string | null) {
  if (!value) return '暂无';
  return formatDateTime(value).replace(/^未设置$/, '暂无');
}

export function formatDateLabel(value?: string | null) {
  if (!value) return '未安排';
  const naive = getNaiveDateTimeParts(value);
  if (naive) {
    const date = new Date(`${naive.dateKey}T00:00:00+08:00`);
    const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: APP_TIME_ZONE, weekday: 'short' }).format(date);
    return `${Number(naive.month)}月${Number(naive.day)}日 ${weekday}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: APP_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

export function sortTasksByDue(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const aTime = a.due_at ? toDateMillis(a.due_at) : Number.MAX_SAFE_INTEGER;
    const bTime = b.due_at ? toDateMillis(b.due_at) : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return toDateMillis(b.updated_at) - toDateMillis(a.updated_at);
  });
}

export function sortTasksByUpdated(tasks: Task[]) {
  return [...tasks].sort((a, b) => toDateMillis(b.updated_at) - toDateMillis(a.updated_at));
}

export function isOpenTask(task: Task) {
  return task.status !== 'done' && task.status !== 'canceled';
}

export function isOverdueTask(task: Task, now = Date.now()) {
  return isOpenTask(task) && Boolean(task.due_at) && toDateMillis(task.due_at as string) < now;
}

export function isDueTodayTask(task: Task, date = currentDateKey()) {
  return isOpenTask(task) && getDateKey(task.due_at) === date;
}

export function groupTodayTasks(tasks: Task[], date = currentDateKey()) {
  const now = Date.now();
  const overdue = sortTasksByDue(tasks.filter((task) => isOverdueTask(task, now)));
  const dueToday = sortTasksByDue(tasks.filter((task) => isDueTodayTask(task, date) && !isOverdueTask(task, now)));
  const later = sortTasksByDue(
    tasks.filter(
      (task) =>
        task.status !== 'done' &&
        task.status !== 'canceled' &&
        !overdue.some((item) => item.id === task.id) &&
        !dueToday.some((item) => item.id === task.id),
    ),
  );
  const completed = sortTasksByUpdated(tasks.filter((task) => task.status === 'done'));

  return { overdue, dueToday, later, completed };
}

export function fallbackPlanGroups(tasks: Task[]): PlanGroup[] {
  const map = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = getDateKey(task.due_at) || 'unscheduled';
    const list = map.get(key) || [];
    list.push(task);
    map.set(key, list);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === 'unscheduled') return 1;
      if (b === 'unscheduled') return -1;
      return a.localeCompare(b);
    })
    .map(([key, list]) => ({
      key,
      group_date: key === 'unscheduled' ? null : key,
      title: key === 'unscheduled' ? '未安排' : formatDateLabel(key),
      tasks: sortTasksByDue(list),
    }));
}

export function groupTasksByProject(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = task.project?.trim() || '未分项目';
    const list = groups.get(key) || [];
    list.push(task);
    groups.set(key, list);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
    .map(([title, list]) => ({
      key: title,
      title,
      tasks: sortTasksByDue(list),
    }));
}

export function normalizeWeekdays(values?: number[]) {
  return Array.from(new Set((values || []).map((item) => Number(item)).filter((item) => item >= 1 && item <= 7))).sort((a, b) => a - b);
}

export function describeRecurrence(recurrence?: TaskRecurrence | null) {
  if (!recurrence?.enabled) return '单次提醒';

  const interval = Math.max(1, Number(recurrence.interval || 1));
  const unit = recurrence.frequency;

  if (unit === 'daily') return interval === 1 ? '每天' : `每 ${interval} 天`;
  if (unit === 'weekly') {
    const days = normalizeWeekdays(recurrence.days_of_week);
    const dayText = days.length ? days.map((day) => weekdayLabelMap[day]).join('、') : '每周';
    return interval === 1 ? dayText : `每 ${interval} 周 · ${dayText}`;
  }
  if (unit === 'monthly') {
    const day = recurrence.day_of_month || recurrence.start_at?.slice(8, 10);
    return interval === 1 ? `每月 ${day || ''} 号`.trim() : `每 ${interval} 月 ${day || ''} 号`.trim();
  }
  return `每 ${interval} ${unit}`;
}

export function describeRecurrenceMeta(recurrence?: TaskRecurrence | null) {
  if (!recurrence?.enabled) return '';
  const parts = [describeRecurrence(recurrence)];
  if (recurrence.end_at) parts.push(`截止 ${formatDateLabel(recurrence.end_at)}`);
  if (recurrence.next_run_at) parts.push(`下次 ${formatDateTime(recurrence.next_run_at)}`);
  return parts.join(' · ');
}
