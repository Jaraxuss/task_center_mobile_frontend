import { truncateText } from '../lib';
import { CustomerMaterial } from '../types';
import { formatDateTime } from '../utils';
import { MaterialStatusPill } from './StatusPills';

export function MaterialRow({
  material,
  compact = false,
  onOpen,
}: {
  material: CustomerMaterial;
  compact?: boolean;
  onOpen: () => void;
}) {
  const preview = material.raw_facts_markdown || '暂無正文';
  const period = material.period_start && material.period_end
    ? `${(material.period_start || '').slice(0, 10)} ~ ${(material.period_end || '').slice(0, 10)}`
    : formatDateTime(material.material_date || material.updated_at);
  return (
    <article className={compact ? 'material-row material-row-compact' : 'material-row'}>
      <button type="button" className="material-row-main" onClick={onOpen}>
        <div className="material-row-title-line">
          <strong>{material.title}</strong>
          <MaterialStatusPill status={material.status} />
        </div>
        <div className="material-row-meta">
          <span>{period}</span>
        </div>
        <p>{truncateText(preview, compact ? 80 : 160)}</p>
      </button>
    </article>
  );
}

export function MaterialRowWithCustomer({
  material,
  customerName,
  onOpen,
}: {
  material: CustomerMaterial;
  customerName: string | null;
  onOpen: () => void;
}) {
  const preview = material.raw_facts_markdown || '暂无正文';
  return (
    <article className="material-row">
      <button type="button" className="material-row-main" onClick={onOpen}>
        <div className="material-row-title-line">
          <strong>{material.title}</strong>
          <MaterialStatusPill status={material.status} />
        </div>
        <div className="material-row-meta">
          {customerName && <span>{customerName}</span>}
          {material.period_start && material.period_end && (
            <span>{(material.period_start || '').slice(0, 10)} ~ {(material.period_end || '').slice(0, 10)}</span>
          )}
        </div>
        <p>{truncateText(preview, 160)}</p>
      </button>
    </article>
  );
}
