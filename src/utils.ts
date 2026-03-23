import { PlanGroup, Task, TaskStatus } from './types';

export const statusLabelMap: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  deferred: '已延期',
  done: '已完成',
  canceled: '已取消',
};

export function formatDateTime(value?: string | null) {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateLabel(value?: string | null) {
  if (!value) return '未安排';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

export function sortTasksByDue(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const aTime = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function sortTasksByUpdated(tasks: Task[]) {
  return [...tasks].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export function isOpenTask(task: Task) {
  return task.status !== 'done' && task.status !== 'canceled';
}

export function isOverdueTask(task: Task, now = Date.now()) {
  return isOpenTask(task) && Boolean(task.due_at) && new Date(task.due_at as string).getTime() < now;
}

export function isDueTodayTask(task: Task, date = new Date().toISOString().slice(0, 10)) {
  return isOpenTask(task) && task.due_at?.slice(0, 10) === date;
}

export function groupTodayTasks(tasks: Task[], date = new Date().toISOString().slice(0, 10)) {
  const now = Date.now();
  const overdue = sortTasksByDue(tasks.filter((task) => isOverdueTask(task, now) && task.due_at?.slice(0, 10) !== date));
  const dueToday = sortTasksByDue(tasks.filter((task) => isDueTodayTask(task, date) && !isOverdueTask(task, now)));
  const doing = sortTasksByDue(tasks.filter((task) => task.status === 'doing' && !overdue.some((item) => item.id === task.id) && !dueToday.some((item) => item.id === task.id)));
  const later = sortTasksByDue(
    tasks.filter(
      (task) =>
        task.status !== 'done' &&
        task.status !== 'canceled' &&
        !overdue.some((item) => item.id === task.id) &&
        !dueToday.some((item) => item.id === task.id) &&
        !doing.some((item) => item.id === task.id),
    ),
  );
  const completed = sortTasksByUpdated(tasks.filter((task) => task.status === 'done'));

  return { overdue, dueToday, doing, later, completed };
}

export function fallbackPlanGroups(tasks: Task[]): PlanGroup[] {
  const map = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = task.due_at?.slice(0, 10) || 'unscheduled';
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
