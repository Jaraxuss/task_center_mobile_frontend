import { useMemo } from 'react';
import { buildRecurrencePayload, toIsoOrNull } from '../lib';
import type { TaskFormState } from '../lib';
import { Customer, Project, TaskStatus } from '../types';
import { describeRecurrence, normalizeWeekdays, statusLabelMap } from '../utils';

export type TaskFormMode = 'create' | 'edit';

const recurrenceFrequencyOptions: Array<{ value: 'daily' | 'weekly' | 'monthly'; label: string }> = [
  { value: 'daily', label: '每天 / 每 N 天' },
  { value: 'weekly', label: '每周 / 每 N 周' },
  { value: 'monthly', label: '每月 / 每 N 月' },
];

const weekdayOptions = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
];

export function TaskEditorSheet({
  mode,
  draft,
  onChange,
  onClose,
  onSubmit,
  busy,
  projects,
  customers,
}: {
  mode: TaskFormMode;
  draft: TaskFormState;
  onChange: (value: TaskFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
  projects: Project[];
  customers: Customer[];
}) {
  const customerMap = useMemo(() => {
    const map = new Map<number, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const groupedProjects = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === 'active');
    const withCustomer: Array<{ project: Project; customerName: string }> = [];
    const withoutCustomer: Project[] = [];
    for (const p of activeProjects) {
      if (p.customer_id != null) {
        const name = customerMap.get(p.customer_id);
        if (name) withCustomer.push({ project: p, customerName: name });
        else withoutCustomer.push(p);
      } else {
        withoutCustomer.push(p);
      }
    }
    const byCustomer = new Map<string, Project[]>();
    withCustomer.forEach(({ project, customerName }) => {
      const list = byCustomer.get(customerName) || [];
      list.push(project);
      byCustomer.set(customerName, list);
    });
    return { byCustomer: [...byCustomer.entries()].sort((a, b) => a[0].localeCompare(b[0])), other: withoutCustomer };
  }, [projects, customerMap]);
  const recurrenceSummary = draft.recurrence_enabled
    ? describeRecurrence(buildRecurrencePayload(draft, toIsoOrNull(draft.due_at)))
    : '单次提醒';

  return (
    <div className="overlay">
      <div className="sheet editor-sheet">
        <div className="sheet-header editor-sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
          <strong>{mode === 'create' ? '新建任务' : '编辑任务'}</strong>
        </div>

        <div className="editor-form">
          <section className="editor-hero-card">
            <div className="editor-hero-copy">
              <span className="topbar-kicker editor-kicker">{mode === 'create' ? 'create task' : 'edit task'}</span>
              <h2>{mode === 'create' ? '把下一件事安排明白' : '把这件事重新定准'}</h2>
              <p>先定标题和时间，再决定它是单次提醒还是一条有节奏的周期任务。</p>
            </div>
            <div className="editor-status-row">
              <span className="editor-info-chip">{recurrenceSummary}</span>
              <span className="editor-info-chip">{draft.status ? statusLabelMap[draft.status] : '待办'}</span>
            </div>
          </section>

          <section className="editor-card editor-card-primary">
            <label className="editor-field editor-field-title">
              <span className="editor-label">标题</span>
              <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="这件事叫什么？一句话说清楚" />
            </label>

            <div className="editor-grid editor-grid-two">
              <label className="editor-field">
                <span className="editor-label">首次提醒时间</span>
                <input type="datetime-local" value={draft.due_at} onChange={(event) => onChange({ ...draft, due_at: event.target.value })} />
              </label>
              <label className="editor-field">
                <span className="editor-label">状态</span>
                <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as TaskStatus })}>
                  <option value="todo">待办</option>
                  <option value="deferred">已延期</option>
                  <option value="done">已完成</option>
                  <option value="canceled">已取消</option>
                </select>
              </label>
            </div>

            <label className="editor-field">
              <span className="editor-label">项目</span>
              <select
                value={draft.project_id != null ? String(draft.project_id) : ''}
                onChange={(event) => {
                  const val = event.target.value;
                  if (!val) {
                    onChange({ ...draft, project_id: null, project: '' });
                    return;
                  }
                  const pid = Number(val);
                  const match = projectsV2.find((p) => p.id === pid);
                  onChange({ ...draft, project_id: pid, project: match?.name || draft.project });
                }}
              >
                <option value="">未分配项目</option>
                {groupedProjects.byCustomer.map(([customerName, projs]) => (
                  <optgroup key={customerName} label={customerName}>
                    {projs.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                  </optgroup>
                ))}
                {groupedProjects.other.length > 0 && (
                  <optgroup label="其他">
                    {groupedProjects.other.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          </section>

          <section className="editor-card recurrence-card">
            <div className="editor-card-head">
              <div>
                <div className="editor-label">周期性提醒</div>
                <strong className="editor-card-title">{recurrenceSummary}</strong>
                <p className="editor-card-note">单次任务保持干净；需要形成节奏时，再把它升级成周期任务。</p>
              </div>
              <button
                type="button"
                className={draft.recurrence_enabled ? 'mini-toggle mini-toggle-active' : 'mini-toggle'}
                onClick={() => onChange({ ...draft, recurrence_enabled: !draft.recurrence_enabled })}
              >
                {draft.recurrence_enabled ? '已开启' : '未开启'}
              </button>
            </div>

            {draft.recurrence_enabled && (
              <div className="recurrence-form editor-grid">
                <div className="editor-grid editor-grid-two">
                  <label className="editor-field">
                    <span className="editor-label">重复频率</span>
                    <select value={draft.recurrence_frequency} onChange={(event) => onChange({ ...draft, recurrence_frequency: event.target.value as TaskFormState['recurrence_frequency'] })}>
                      {recurrenceFrequencyOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="editor-field">
                    <span className="editor-label">间隔</span>
                    <input
                      inputMode="numeric"
                      value={draft.recurrence_interval}
                      onChange={(event) => onChange({ ...draft, recurrence_interval: event.target.value.replace(/[^0-9]/g, '') || '1' })}
                      placeholder="1"
                    />
                  </label>
                </div>

                {draft.recurrence_frequency === 'weekly' && (
                  <div className="editor-field">
                    <div className="editor-label">每周这些天</div>
                    <div className="option-chip-grid">
                      {weekdayOptions.map((option) => {
                        const active = draft.recurrence_weekdays.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={active ? 'chip chip-active' : 'chip'}
                            onClick={() =>
                              onChange({
                                ...draft,
                                recurrence_weekdays: active
                                  ? draft.recurrence_weekdays.filter((item) => item !== option.value)
                                  : normalizeWeekdays([...draft.recurrence_weekdays, option.value]),
                              })
                            }
                          >
                            周{option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {draft.recurrence_frequency === 'monthly' && (
                  <label className="editor-field">
                    <span className="editor-label">每月几号</span>
                    <input
                      inputMode="numeric"
                      value={draft.recurrence_month_day}
                      onChange={(event) => onChange({ ...draft, recurrence_month_day: event.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
                      placeholder="例如 15"
                    />
                  </label>
                )}

                <label className="editor-field">
                  <span className="editor-label">结束时间（可选）</span>
                  <input type="datetime-local" value={draft.recurrence_until} onChange={(event) => onChange({ ...draft, recurrence_until: event.target.value })} />
                </label>
                <div className="helper-text">当前实现里，首次提醒时间同时作为周期锚点。后端接住后，就不会再靠人脑补班。</div>
              </div>
            )}
          </section>

          <section className="editor-card editor-card-soft">
            <label className="editor-field editor-field-description">
              <span className="editor-label">描述</span>
              <textarea rows={5} value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="补充一点上下文，未来回看时会轻松很多。" />
            </label>
          </section>
        </div>

        <div className="editor-submit-bar">
          <button type="button" className="primary-submit editor-submit-button" onClick={onSubmit} disabled={busy}>
            {busy ? '保存中…' : mode === 'create' ? '创建任务' : '保存修改'}
          </button>
        </div>

      </div>
    </div>
  );
}
