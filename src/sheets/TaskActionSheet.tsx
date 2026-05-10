import type { TaskActionType } from '../lib';
import { Task } from '../types';

export interface ActionSheetState {
  type: TaskActionType;
  datetime: string;
  reason: string;
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
          {(state.type === 'complete' || state.type === 'defer' || state.type === 'cancel') && (
            <label>
              <span>{state.type === 'complete' ? '跟进结果（可选）' : state.type === 'cancel' ? '取消原因（可选）' : '延期说明（可选）'}</span>
              <textarea rows={4} value={state.reason} onChange={(event) => onChange({ ...state, reason: event.target.value })} placeholder={state.type === 'complete' ? '比如使用情况、反馈、问题原因、下一步判断。' : '填一点上下文，后面回看不容易失忆。'} />
            </label>
          )}
        </div>
        <button type="button" className={state.type === 'cancel' ? 'primary-submit primary-submit-danger' : 'primary-submit'} onClick={onSubmit} disabled={busyAction === state.type}>
          {busyAction === state.type ? '处理中…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
