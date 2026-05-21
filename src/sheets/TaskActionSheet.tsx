import type { TaskActionType } from '../lib';
import { Task } from '../types';

const datePartFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface ActionSheetState {
  type: TaskActionType;
  datetime: string;
  reason: string;
}

function formatShortcutDateTime(date: Date, hour: number, minute: number) {
  const parts = datePartFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getRescheduleShortcuts() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextMonday = new Date(now);
  const day = now.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);

  return [
    { label: '明天上午', value: formatShortcutDateTime(tomorrow, 9, 30) },
    { label: '明天下午', value: formatShortcutDateTime(tomorrow, 14, 0) },
    { label: '下周一', value: formatShortcutDateTime(nextMonday, 9, 30) },
  ];
}

export function TaskActionSheet({
  task,
  state,
  busyAction,
  onChange,
  onClose,
  onSubmit,
}: {
  task: Task;
  state: ActionSheetState;
  busyAction: string | null;
  onChange: (state: ActionSheetState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const title = state.type === 'complete' ? '标记完成' : state.type === 'reschedule' ? '改时间' : state.type === 'defer' ? '延期任务' : '取消任务';
  const submitLabel = state.type === 'complete' ? '确认完成' : state.type === 'reschedule' ? '保存时间' : state.type === 'defer' ? '确认延期' : '确认取消';

  return (
    <div className="overlay">
      <div className="sheet filter-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            返回
          </button>
          <strong>{title}</strong>
          <span className="muted-text">#{task.id}</span>
        </div>
        <div className="filter-form">
          {(state.type === 'reschedule' || state.type === 'defer') && (
            <label>
              <span>{state.type === 'reschedule' ? '新的时间' : '延期到'}</span>
              <input type="datetime-local" value={state.datetime} onChange={(event) => onChange({ ...state, datetime: event.target.value })} />
            </label>
          )}
          {state.type === 'reschedule' && (
            <div className="time-shortcut-row" aria-label="常用时间">
              {getRescheduleShortcuts().map((shortcut) => (
                <button key={shortcut.label} type="button" className="time-shortcut-button" onClick={() => onChange({ ...state, datetime: shortcut.value })}>
                  {shortcut.label}
                </button>
              ))}
            </div>
          )}
          {(state.type === 'complete' || state.type === 'defer' || state.type === 'cancel') && (
            <label>
              <span>{state.type === 'complete' ? '跟进结果（可选）' : state.type === 'cancel' ? '取消原因（可选）' : '延期说明（可选）'}</span>
              <textarea rows={4} value={state.reason} onChange={(event) => onChange({ ...state, reason: event.target.value })} placeholder={state.type === 'complete' ? '比如使用情况、反馈、问题原因、下一步判断。' : '填一点上下文，后面回看不容易失忆。'} />
            </label>
          )}
        </div>
        <div className="sheet-submit-bar">
          <button type="button" className={state.type === 'cancel' ? 'primary-submit primary-submit-danger' : 'primary-submit'} onClick={onSubmit} disabled={busyAction === state.type}>
            {busyAction === state.type ? '处理中…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
