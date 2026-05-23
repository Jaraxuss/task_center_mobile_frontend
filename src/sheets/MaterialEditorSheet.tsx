import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { truncateText } from '../lib';
import type { MaterialFormState } from '../lib';
import { FactStatusPill, materialStatusLabelMap } from '../components';
import { Customer, CustomerMaterial, CustomerMaterialStatus, Fact, ReviewBatch } from '../types';
import { formatDateTime } from '../utils';

const materialTypeLabelMap: Record<string, string> = {
  period_summary: '周期聚合',
  fact_bundle: '事实合订',
  meeting_note: '会议纪要',
  project_digest: '项目摘要',
};

export function MaterialEditorSheet({
  draft,
  material,
  batch,
  customer,
  projectName,
  linkedFacts,
  factsLoading,
  onChange,
  onClose,
  onSubmit,
  onStatusChange,
  onArchive,
  onOpenFact,
  busy,
}: {
  draft: MaterialFormState;
  material: CustomerMaterial | null;
  batch: ReviewBatch | null;
  customer: Customer | null;
  projectName: string | null;
  linkedFacts: Fact[];
  factsLoading: boolean;
  onChange: (value: MaterialFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  onStatusChange: (status: CustomerMaterialStatus) => void;
  onArchive: () => void;
  onOpenFact: (factId: number) => void;
  busy: boolean;
}) {
  const [mdMode, setMdMode] = useState<'preview' | 'edit'>('preview');
  const period = batch?.period_start && batch?.period_end
    ? `${(batch.period_start || '').slice(0, 10)} ~ ${(batch.period_end || '').slice(0, 10)}`
    : (material?.period_start && material?.period_end
      ? `${(material.period_start || '').slice(0, 10)} ~ ${(material.period_end || '').slice(0, 10)}`
      : '—');
  return (
    <div className="overlay">
      <div className="sheet editor-sheet material-editor-sheet">
        <div className="sheet-header editor-sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>客户材料审核</strong>
          {material && <span className="muted-text">#{material.id}</span>}
        </div>

        <div className="editor-form">
          <section className="editor-hero-card material-editor-hero-card">
            <div className="editor-hero-copy">
              <span className="topbar-kicker editor-kicker">customer material</span>
              <h2>本批材料原文</h2>
              <p className="editor-card-note">由 cron 聚合本周期事实拼成；如有错别字、漏写可在此修正。简要纪要 / 洞察由 NotebookLM 上传后生成。</p>
            </div>
          </section>

          <section className="editor-card editor-card-primary">
            <div className="editor-grid editor-grid-two">
              <div className="editor-field">
                <span className="editor-label">客户</span>
                <div className="editor-readonly">{customer?.name || '—'}</div>
              </div>
              <div className="editor-field">
                <span className="editor-label">项目</span>
                <div className="editor-readonly">{projectName || '—'}</div>
              </div>
              <div className="editor-field">
                <span className="editor-label">周期</span>
                <div className="editor-readonly">{period}</div>
              </div>
              <div className="editor-field">
                <span className="editor-label">类型</span>
                <div className="editor-readonly">
                  {material?.material_type
                    ? (materialTypeLabelMap[material.material_type] || material.material_type)
                    : '—'}
                </div>
              </div>
              <div className="editor-field">
                <span className="editor-label">材料状态</span>
                <div className="editor-readonly">{materialStatusLabelMap[draft.status]}</div>
              </div>
              <div className="editor-field">
                <span className="editor-label">更新于</span>
                <div className="editor-readonly">{material ? formatDateTime(material.updated_at) : '—'}</div>
              </div>
            </div>

            <label className="editor-field editor-field-title">
              <span className="editor-label">材料标题</span>
              <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="例如：佰世赛｜客户级｜2026-04-27 ~ 2026-05-03" />
            </label>
          </section>

          <section className="editor-card editor-card-soft">
            <div className="editor-field editor-field-description">
              <div className="editor-label-row">
                <span className="editor-label">原始事实 Markdown</span>
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
                <textarea rows={16} value={draft.raw_facts_markdown} onChange={(event) => onChange({ ...draft, raw_facts_markdown: event.target.value })} placeholder="按 fact_date 排序后的原文拼接。审核时只做错别字 / 漏写修正。" />
              ) : (
                <div className="markdown-body">
                  {draft.raw_facts_markdown ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.raw_facts_markdown}</ReactMarkdown>
                  ) : (
                    <p className="markdown-empty">暂无正文</p>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="editor-card editor-card-soft material-facts-panel">
            <div className="editor-label">本批材料关联的事实</div>
            {factsLoading ? (
              <div className="helper-text">关联事实加载中…</div>
            ) : linkedFacts.length === 0 ? (
              <div className="helper-text">暂无关联事实</div>
            ) : (
              <div className="material-list compact-material-list">
                {linkedFacts.map((fact) => (
                  <article key={fact.id} className="material-row material-row-compact fact-row">
                    <button type="button" className="material-row-main" onClick={() => onOpenFact(fact.id)}>
                      <div className="material-row-title-line">
                        <strong>{fact.title || '（无标题）'}</strong>
                        <FactStatusPill status={fact.status} />
                      </div>
                      <div className="material-row-meta">
                        {fact.fact_date && <span>{(fact.fact_date || '').slice(0, 10)}</span>}
                        {fact.source_type && <span>{fact.source_type}</span>}
                      </div>
                      <p>{truncateText(fact.raw_markdown, 80)}</p>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="editor-submit-bar material-editor-actions">
          <button type="button" className="primary-submit editor-submit-button" onClick={onSubmit} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
          <button type="button" className="action-button" onClick={() => onStatusChange('approved')} disabled={busy || draft.status === 'approved'}>
            通过
          </button>
          <button type="button" className="action-button" onClick={() => onStatusChange('skipped')} disabled={busy || draft.status === 'skipped'}>
            跳过
          </button>
          <button type="button" className="action-button action-danger" onClick={onArchive} disabled={busy}>
            归档
          </button>
        </div>
      </div>
    </div>
  );
}
