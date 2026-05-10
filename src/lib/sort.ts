import { KnowledgeFactCustomerOverview, Task } from '../types';
import { sortTasksByDue } from '../utils';

export function sortTasksWithPreference(tasks: Task[], taskOrder: number[]) {
  const orderMap = new Map(taskOrder.map((taskId, index) => [taskId, index]));
  return [...tasks].sort((a, b) => {
    const aIndex = orderMap.get(a.id);
    const bIndex = orderMap.get(b.id);
    if (aIndex != null || bIndex != null) {
      if (aIndex != null && bIndex != null) return aIndex - bIndex;
      return aIndex != null ? -1 : 1;
    }
    const byDue = sortTasksByDue([a, b]);
    return byDue[0]?.id === a.id ? -1 : 1;
  });
}

export function sortProjectGroupsWithPreference(groups: Array<{ key: string; title: string; tasks: Task[] }>, pinnedProjects: string[], projectOrder: string[]) {
  const pinnedMap = new Map(pinnedProjects.map((name, index) => [name, index]));
  const projectOrderMap = new Map(projectOrder.map((name, index) => [name, index]));

  return [...groups].sort((a, b) => {
    const aPinned = pinnedMap.has(a.title);
    const bPinned = pinnedMap.has(b.title);
    if (aPinned || bPinned) {
      if (aPinned && bPinned) {
        const aPinnedIndex = pinnedMap.get(a.title) ?? 10 ** 9;
        const bPinnedIndex = pinnedMap.get(b.title) ?? 10 ** 9;
        if (aPinnedIndex !== bPinnedIndex) return aPinnedIndex - bPinnedIndex;
      } else {
        return aPinned ? -1 : 1;
      }
    }

    const aOrdered = projectOrderMap.has(a.title);
    const bOrdered = projectOrderMap.has(b.title);
    if (aOrdered || bOrdered) {
      if (aOrdered && bOrdered) return (projectOrderMap.get(a.title) ?? 0) - (projectOrderMap.get(b.title) ?? 0);
      return aOrdered ? -1 : 1;
    }

    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

export function buildProjectOrderPayload(groups: Array<{ key: string; title: string; tasks: Task[] }>, currentOrder: string[], movingProjectName: string, direction: 'up' | 'down') {
  const visibleNames = groups.map((group) => group.title);
  const preferredVisible = currentOrder.filter((projectName) => visibleNames.includes(projectName));
  const remainingVisible = visibleNames.filter((projectName) => !preferredVisible.includes(projectName));
  const orderedVisible = [...preferredVisible, ...remainingVisible];
  const currentIndex = orderedVisible.indexOf(movingProjectName);
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedVisible.length) return currentOrder;

  const nextVisible = [...orderedVisible];
  const [moving] = nextVisible.splice(currentIndex, 1);
  nextVisible.splice(targetIndex, 0, moving);

  const preservedHidden = currentOrder.filter((projectName) => !visibleNames.includes(projectName));
  return [...nextVisible, ...preservedHidden];
}

export function sortKnowledgeCustomersWithPreference(
  customers: KnowledgeFactCustomerOverview[],
  pinnedIds: number[],
  orderIds: number[],
): KnowledgeFactCustomerOverview[] {
  const pinnedMap = new Map(pinnedIds.map((id, idx) => [id, idx]));
  const orderMap = new Map(orderIds.map((id, idx) => [id, idx]));

  return [...customers].sort((a, b) => {
    const aId = a.customer_id ?? -1;
    const bId = b.customer_id ?? -1;

    const aPinned = aId !== -1 && pinnedMap.has(aId);
    const bPinned = bId !== -1 && pinnedMap.has(bId);
    if (aPinned || bPinned) {
      if (aPinned && bPinned) {
        return (pinnedMap.get(aId) ?? 0) - (pinnedMap.get(bId) ?? 0);
      }
      return aPinned ? -1 : 1;
    }

    const aOrdered = aId !== -1 && orderMap.has(aId);
    const bOrdered = bId !== -1 && orderMap.has(bId);
    if (aOrdered || bOrdered) {
      if (aOrdered && bOrdered) {
        return (orderMap.get(aId) ?? 0) - (orderMap.get(bId) ?? 0);
      }
      return aOrdered ? -1 : 1;
    }

    const aLatest = a.latest_fact_at || '';
    const bLatest = b.latest_fact_at || '';
    if (aLatest !== bLatest) return bLatest.localeCompare(aLatest);
    return a.customer_name.localeCompare(b.customer_name);
  });
}
