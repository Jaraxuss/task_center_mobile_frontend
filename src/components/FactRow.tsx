import { truncateText } from '../lib';
import { Fact } from '../types';
import { FactStatusPill } from './StatusPills';

export function FactRow({ fact, onOpen }: { fact: Fact; onOpen: () => void }) {
  const preview = fact.raw_markdown || '暂无正文';
  return (
    <article className="material-row fact-row">
      <button type="button" className="material-row-main" onClick={onOpen}>
        <div className="material-row-title-line">
          <strong>{fact.title || '（无标题）'}</strong>
          <FactStatusPill status={fact.status} />
        </div>
        <div className="material-row-meta">
          {fact.fact_date && <span>{(fact.fact_date || '').slice(0, 10)}</span>}
          {fact.source_type && <span>{fact.source_type}</span>}
          {fact.task_id != null && <span>任务 #{fact.task_id}</span>}
        </div>
        {fact.value_types.length > 0 && (
          <div className="material-value-types">
            {fact.value_types.map((type) => <span key={type}>{type}</span>)}
          </div>
        )}
        <p>{truncateText(preview, 140)}</p>
      </button>
    </article>
  );
}

export function CompactFactRow({
  fact,
  customerName,
  onOpen,
}: {
  fact: Fact;
  customerName: string | null;
  onOpen: () => void;
}) {
  return (
    <article className="material-row material-row-compact fact-row task-fact-row">
      <button type="button" className="material-row-main task-fact-row-main" onClick={onOpen}>
        <div className="task-fact-row-line">
          <strong className="task-fact-row-title">{fact.title || '（无标题）'}</strong>
          <FactStatusPill status={fact.status} />
        </div>
        <div className="task-fact-row-meta">
          {customerName && <span>{customerName}</span>}
          {fact.fact_date && <span>{(fact.fact_date || '').slice(0, 10)}</span>}
        </div>
      </button>
    </article>
  );
}
