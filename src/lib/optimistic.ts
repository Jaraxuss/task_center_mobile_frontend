import { DashboardBoardGroup, PlanGroup, Task, TaskStatus } from '../types';
import { currentDateKey, fallbackPlanGroups, getDateKey, sortTasksByDue, sortTasksByUpdated } from '../utils';
import { localNowString } from './format';

export type TaskActionType = 'complete' | 'reschedule' | 'defer' | 'cancel';

const boardTitles: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  deferred: '已延期',
  done: '已完成',
  canceled: '已取消',
};

const statusOrder: TaskStatus[] = ['todo', 'doing', 'deferred', 'done', 'canceled'];

export { statusOrder, boardTitles };

export function regroupPlanGroups(groups: PlanGroup[], updated: Task) {
  const all = groups.flatMap((group) => group.tasks).filter((task, index, list) => list.findIndex((item) => item.id === task.id) === index && task.id !== updated.id);
  const scheduleDate = getDateKey(updated.deferred_to || updated.due_at);
  if (updated.status !== 'done' && updated.status !== 'canceled' && scheduleDate && scheduleDate > currentDateKey()) {
    all.push(updated);
  }
  return fallbackPlanGroups(all);
}

export function regroupBoardStatusGroups(groups: DashboardBoardGroup[], updated: Task) {
  const all = groups.flatMap((group) => group.tasks).filter((task, index, list) => list.findIndex((item) => item.id === task.id) === index && task.id !== updated.id);
  all.push(updated);
  return statusOrder.map((status) => ({
    key: status,
    status,
    title: boardTitles[status],
    tasks: sortTasksByDue(all.filter((task) => task.status === status)),
  }));
}

export function upsertTask(list: Task[], updated: Task) {
  const exists = list.some((task) => task.id === updated.id);
  const next = exists ? list.map((task) => (task.id === updated.id ? updated : task)) : [updated, ...list];
  return sortTasksByUpdated(next);
}

export function makeOptimisticTask(task: Task, type: TaskActionType, payload?: { due_at?: string | null; deferred_to?: string | null; reason?: string }) {
  const now = localNowString();
  if (type === 'complete') {
    return { ...task, status: 'done' as TaskStatus, completed_at: now, completion_note: payload?.reason ?? task.completion_note ?? null, canceled_at: null, updated_at: now };
  }
  if (type === 'reschedule') {
    return { ...task, due_at: payload?.due_at ?? task.due_at ?? null, updated_at: now };
  }
  if (type === 'defer') {
    return {
      ...task,
      status: 'deferred' as TaskStatus,
      due_at: payload?.due_at ?? task.due_at ?? null,
      deferred_to: payload?.deferred_to ?? task.deferred_to ?? null,
      updated_at: now,
    };
  }
  return {
    ...task,
    status: 'canceled' as TaskStatus,
    canceled_at: now,
    completed_at: null,
    updated_at: now,
  };
}
