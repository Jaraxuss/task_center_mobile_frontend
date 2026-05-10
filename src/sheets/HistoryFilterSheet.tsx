export function HistoryFilterSheet({
  draft,
  onChange,
  onClose,
  onApply,
  onReset,
}: {
  draft: { q: string; status: string; date: string };
  onChange: (value: { q: string; status: string; date: string }) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className="overlay">
      <div className="sheet filter-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>历史筛选</strong>
          <button type="button" className="ghost-button" onClick={onReset}>
            重置
          </button>
        </div>
        <div className="filter-form">
          <label>
            <span>关键词</span>
            <input value={draft.q} onChange={(event) => onChange({ ...draft, q: event.target.value })} placeholder="搜标题 / 描述" />
          </label>
          <label>
            <span>状态</span>
            <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value })}>
              <option value="">全部</option>
              <option value="todo">待办</option>
              <option value="doing">进行中</option>
              <option value="deferred">已延期</option>
              <option value="done">已完成</option>
              <option value="canceled">已取消</option>
            </select>
          </label>
          <label>
            <span>日期</span>
            <input type="date" value={draft.date} onChange={(event) => onChange({ ...draft, date: event.target.value })} />
          </label>
        </div>
        <button type="button" className="primary-submit" onClick={onApply}>
          应用筛选
        </button>
      </div>
    </div>
  );
}
