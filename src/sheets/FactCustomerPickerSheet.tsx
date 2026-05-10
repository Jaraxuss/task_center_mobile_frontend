import { useMemo, useState } from 'react';
import { Customer } from '../types';

export function FactCustomerPickerSheet({
  customers,
  currentCustomerId,
  busy,
  onClose,
  onSelect,
}: {
  customers: Customer[];
  currentCustomerId: number | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (customerId: number | null) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = customers.filter((c) => !c.status || c.status === 'active' || c.id === currentCustomerId);
    if (!q) return visible;
    return visible.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.area && c.area.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [customers, currentCustomerId, query]);

  return (
    <div className="overlay">
      <div className="sheet filter-sheet customer-picker-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>选择客户</strong>
          <span className="muted-text">{filtered.length} 项</span>
        </div>
        <div className="customer-picker-search">
          <span className="board-search-icon" aria-hidden="true">⌕</span>
          <input
            className="board-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索客户名称 / 区域"
            autoFocus
          />
          {query ? (
            <button type="button" className="board-search-clear" onClick={() => setQuery('')} aria-label="清空搜索">×</button>
          ) : null}
        </div>
        <div className="customer-picker-list">
          <button
            type="button"
            className={currentCustomerId == null ? 'customer-picker-row customer-picker-row-active' : 'customer-picker-row'}
            onClick={() => onSelect(null)}
            disabled={busy}
          >
            <strong>未关联</strong>
            <span className="muted-text">清空当前客户</span>
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === currentCustomerId ? 'customer-picker-row customer-picker-row-active' : 'customer-picker-row'}
              onClick={() => onSelect(c.id)}
              disabled={busy}
            >
              <strong>{c.name}</strong>
              {c.area && <span className="muted-text">{c.area}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="helper-text customer-picker-empty">没有匹配的客户</div>
          )}
        </div>
      </div>
    </div>
  );
}
