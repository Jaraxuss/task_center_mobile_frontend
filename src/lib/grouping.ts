import { Customer, CustomerMaterial, Fact, ReviewBatch, Task } from '../types';
import { formatDateLabel, getDateKey, sortTasksByDue, sortTasksByUpdated, toDateMillis } from '../utils';

export interface MaterialBatchGroup {
  key: string;
  batch: ReviewBatch | null;
  materials: CustomerMaterial[];
}

export function groupMaterialsByBatch(
  materials: CustomerMaterial[],
  batches: ReviewBatch[],
): MaterialBatchGroup[] {
  const batchMap = new Map<number, ReviewBatch>();
  batches.forEach((b) => batchMap.set(b.id, b));
  const grouped = new Map<string, CustomerMaterial[]>();
  materials.forEach((m) => {
    const key = m.review_batch_id != null ? `batch-${m.review_batch_id}` : 'unbatched';
    const list = grouped.get(key) || [];
    list.push(m);
    grouped.set(key, list);
  });
  const groups: MaterialBatchGroup[] = Array.from(grouped.entries()).map(([key, list]) => {
    const batchId = key.startsWith('batch-') ? Number(key.slice('batch-'.length)) : null;
    const batch = batchId != null ? batchMap.get(batchId) ?? null : null;
    return {
      key,
      batch,
      materials: [...list].sort((a, b) => toDateMillis(b.updated_at) - toDateMillis(a.updated_at)),
    };
  });
  // sort: batched groups first by period_end desc, then unbatched last
  groups.sort((a, b) => {
    if (!a.batch && b.batch) return 1;
    if (a.batch && !b.batch) return -1;
    if (!a.batch && !b.batch) return 0;
    const aEnd = a.batch?.period_end ? toDateMillis(a.batch.period_end) : 0;
    const bEnd = b.batch?.period_end ? toDateMillis(b.batch.period_end) : 0;
    return bEnd - aEnd;
  });
  return groups;
}

export interface FactCustomerGroup {
  key: string;
  title: string;
  customer: Customer | null;
  facts: Fact[];
}

export function groupFactsByCustomer(facts: Fact[], customers: Customer[]): FactCustomerGroup[] {
  const customerMap = new Map<number, Customer>();
  customers.forEach((c) => customerMap.set(c.id, c));
  const grouped = new Map<string, Fact[]>();
  facts.forEach((f) => {
    const key = f.customer_id != null ? `customer-${f.customer_id}` : 'no-customer';
    const list = grouped.get(key) || [];
    list.push(f);
    grouped.set(key, list);
  });
  const groups: FactCustomerGroup[] = Array.from(grouped.entries()).map(([key, list]) => {
    const cid = key.startsWith('customer-') ? Number(key.slice('customer-'.length)) : null;
    const customer = cid != null ? customerMap.get(cid) ?? null : null;
    const title = customer?.name || (cid != null ? `客户 #${cid}` : '未归类');
    return {
      key,
      title,
      customer,
      facts: [...list].sort((a, b) => toDateMillis(b.fact_date || b.updated_at) - toDateMillis(a.fact_date || a.updated_at)),
    };
  });
  groups.sort((a, b) => {
    if (!a.customer && b.customer) return 1;
    if (a.customer && !b.customer) return -1;
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });
  return groups;
}

export function getHistoryDateGroups(tasks: Task[]) {
  const map = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = getDateKey(task.updated_at) || 'unknown';
    const list = map.get(key) || [];
    list.push(task);
    map.set(key, list);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, list]) => ({
      key,
      title: key === 'unknown' ? '更早之前' : formatDateLabel(key),
      tasks: sortTasksByUpdated(list),
    }));
}
