import { CustomerMaterialStatus, FactStatus, TaskStatus } from '../types';
import { statusLabelMap } from '../utils';

export const materialStatusLabelMap: Record<CustomerMaterialStatus, string> = {
  pending: '待审核',
  approved: '已确认',
  skipped: '已跳过',
  uploaded: '已上传',
};

export const factStatusLabelMap: Record<FactStatus, string> = {
  draft: '草稿',
  confirmed: '已确认',
  rejected: '已驳回',
};

export function StatusPill({ status }: { status: TaskStatus }) {
  return <span className={`status-pill status-${status}`}>{statusLabelMap[status]}</span>;
}

export function MaterialStatusPill({ status }: { status: CustomerMaterialStatus }) {
  return <span className={`material-status-pill material-status-${status}`}>{materialStatusLabelMap[status]}</span>;
}

export function FactStatusPill({ status }: { status: FactStatus }) {
  return <span className={`material-status-pill material-status-${status}`}>{factStatusLabelMap[status]}</span>;
}
