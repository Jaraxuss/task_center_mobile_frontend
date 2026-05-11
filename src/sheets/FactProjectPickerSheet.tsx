import { useMemo, useState } from 'react';
import { Project } from '../types';

export function FactProjectPickerSheet({
  projects,
  currentProjectId,
  customerName,
  busy,
  onClose,
  onSelect,
}: {
  projects: Project[];
  currentProjectId: number | null;
  customerName: string | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (projectId: number | null) => void;
}) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    return projects.filter((p) => !p.status || p.status === 'active' || p.id === currentProjectId);
  }, [projects, currentProjectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.area && p.area.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [visible, query]);

  if (!customerName) {
    return (
      <div className="overlay">
        <div className="sheet filter-sheet customer-picker-sheet">
          <div className="sheet-header">
            <button type="button" className="ghost-button" onClick={onClose}>
              关闭
            </button>
            <strong>选择项目</strong>
          </div>
          <div className="customer-picker-list">
            <div className="helper-text customer-picker-empty">请先为该事实选择客户后再选择项目</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="sheet filter-sheet customer-picker-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>选择项目</strong>
          <span className="muted-text">{filtered.length} 项</span>
        </div>
        <div className="helper-text" style={{ padding: '6px 16px 0' }}>
          客户：{customerName}
        </div>
        <div className="customer-picker-search">
          <span className="board-search-icon" aria-hidden="true">⌕</span>
          <input
            className="board-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目名称 / 区域"
            autoFocus
          />
          {query ? (
            <button type="button" className="board-search-clear" onClick={() => setQuery('')} aria-label="清空搜索">×</button>
          ) : null}
        </div>
        <div className="customer-picker-list">
          <button
            type="button"
            className={currentProjectId == null ? 'customer-picker-row customer-picker-row-active' : 'customer-picker-row'}
            onClick={() => onSelect(null)}
            disabled={busy}
          >
            <strong>未归项目</strong>
            <span className="muted-text">清空当前项目</span>
          </button>
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === currentProjectId ? 'customer-picker-row customer-picker-row-active' : 'customer-picker-row'}
              onClick={() => onSelect(p.id)}
              disabled={busy}
            >
              <strong>{p.name}</strong>
              <span className="muted-text">
                {[p.status && p.status !== 'active' ? `状态：${p.status}` : null, p.area].filter(Boolean).join(' · ') || '—'}
              </span>
            </button>
          ))}
          {filtered.length === 0 && visible.length > 0 && (
            <div className="helper-text customer-picker-empty">没有匹配的项目</div>
          )}
          {visible.length === 0 && (
            <div className="helper-text customer-picker-empty">该客户暂无项目</div>
          )}
        </div>
      </div>
    </div>
  );
}
