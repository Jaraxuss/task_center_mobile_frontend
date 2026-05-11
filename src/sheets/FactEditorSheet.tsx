import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FactFormState } from '../lib';
import { factStatusLabelMap } from '../components';
import { Customer, Fact, FactStatus } from '../types';

const factValueTypeOptions = ['客户需求', '业务流程', '系统限制', '关键人信息', '客户偏好', '风险/阻塞', '解决方案', '商机/增购/续费', '售后问题', '可复用方法论'];

export function FactEditorSheet({
  draft,
  fact,
  customer,
  onChange,
  onClose,
  onSubmit,
  onStatusChange,
  onDelete,
  onOpenTask,
  onOpenCustomerPicker,
  busy,
}: {
  draft: FactFormState;
  fact: Fact | null;
  customer: Customer | null;
  onChange: (value: FactFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  onStatusChange: (status: FactStatus) => void;
  onDelete: () => void;
  onOpenTask: (taskId: number) => void;
  onOpenCustomerPicker: () => void;
  busy: boolean;
}) {
  const [mdMode, setMdMode] = useState<'preview' | 'edit'>('preview');
  const toggleValueType = (valueType: string) => {
    const active = draft.value_types.includes(valueType);
    onChange({
      ...draft,
      value_types: active ? draft.value_types.filter((item) => item !== valueType) : [...draft.value_types, valueType],
    });
  };
  return (
    <div className="overlay">
      <div className="sheet editor-sheet material-editor-sheet fact-editor-sheet">
        <div className="sheet-header editor-sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>客户事实</strong>
          {fact && <span className="muted-text">#{fact.id}</span>}
        </div>

        <div className="editor-form">
          <section className="editor-hero-card material-editor-hero-card">
            <div className="editor-hero-copy">
              <span className="topbar-kicker editor-kicker">customer fact</span>
              <h2>事实原文</h2>
              <p className="editor-card-note">raw_markdown 是事实唯一正文。审核时只做错别字 / 漏写修正。</p>
            </div>
          </section>

          <section className="editor-card editor-card-primary">
            <div className="editor-grid editor-grid-two">
              <div className="editor-field">
                <span className="editor-label">客户</span>
                <button
                  type="button"
                  className="editor-readonly editor-pickable"
                  onClick={onOpenCustomerPicker}
                  disabled={busy}
                  aria-label="修改关联客户"
                >
                  <span className="editor-pickable-value">{customer?.name || '— 选择客户'}</span>
                  <span className="editor-pickable-glyph" aria-hidden="true">›</span>
                </button>
              </div>
              <div className="editor-field">
                <span className="editor-label">关联任务</span>
                <div className="editor-readonly">
                  {fact?.task_id != null ? (
                    <button type="button" className="link-button" onClick={() => onOpenTask(fact.task_id as number)}>
                      任务 #{fact.task_id} →
                    </button>
                  ) : '—'}
                </div>
              </div>
            </div>

            <label className="editor-field editor-field-title">
              <span className="editor-label">事实标题</span>
              <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="例如：客户反馈 xxx" />
            </label>

            <div className="editor-grid editor-grid-two">
              <label className="editor-field">
                <span className="editor-label">事实时间</span>
                <input type="datetime-local" value={draft.fact_date} onChange={(event) => onChange({ ...draft, fact_date: event.target.value })} />
              </label>
              <label className="editor-field">
                <span className="editor-label">状态</span>
                <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as FactStatus })}>
                  {(Object.keys(factStatusLabelMap) as FactStatus[]).map((status) => (
                    <option key={status} value={status}>{factStatusLabelMap[status]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="editor-field">
              <span className="editor-label">价值类型</span>
              <div className="option-chip-grid material-value-chip-grid">
                {factValueTypeOptions.map((option) => (
                  <button key={option} type="button" className={draft.value_types.includes(option) ? 'chip chip-active' : 'chip'} onClick={() => toggleValueType(option)}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="editor-card editor-card-soft">
            <div className="editor-field editor-field-description">
              <div className="editor-label-row">
                <span className="editor-label">事实原文 Markdown</span>
                <div className="markdown-mode-toggle">
                  <button
                    type="button"
                    className={mdMode === 'preview' ? 'toggle-btn toggle-btn-active' : 'toggle-btn'}
                    onClick={() => setMdMode('preview')}
                  >
                    预览
                  </button>
                  <button
                    type="button"
                    className={mdMode === 'edit' ? 'toggle-btn toggle-btn-active' : 'toggle-btn'}
                    onClick={() => setMdMode('edit')}
                  >
                    编辑
                  </button>
                </div>
              </div>
              {mdMode === 'edit' ? (
                <textarea rows={14} value={draft.raw_markdown} onChange={(event) => onChange({ ...draft, raw_markdown: event.target.value })} placeholder="保留客户原话、转写、证据截图描述。" />
              ) : (
                <div className="markdown-body">
                  {draft.raw_markdown ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.raw_markdown}</ReactMarkdown>
                  ) : (
                    <p className="markdown-empty">暂无正文</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="editor-submit-bar material-editor-actions">
          <button type="button" className="primary-submit editor-submit-button" onClick={onSubmit} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
          {draft.status !== 'confirmed' && (
            <button type="button" className="action-button" onClick={() => onStatusChange('confirmed')} disabled={busy}>
              标为已确认
            </button>
          )}
          {draft.status !== 'draft' && (
            <button type="button" className="action-button" onClick={() => onStatusChange('draft')} disabled={busy}>
              标为草稿
            </button>
          )}
          {draft.status !== 'rejected' && (
            <button type="button" className="action-button" onClick={() => onStatusChange('rejected')} disabled={busy}>
              标为驳回
            </button>
          )}
          <button type="button" className="action-button action-danger" onClick={onDelete} disabled={busy}>
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
