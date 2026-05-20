import { ReminderFormState, buildDefaultAiPrompt } from '../lib';
import { ReminderDeliveryMode, ReminderReceiveIdType, Task } from '../types';

const deliveryModes: Array<{ value: ReminderDeliveryMode; title: string; note: string }> = [
  { value: 'feishu_card_v2', title: '飞书卡片 V2', note: '默认推荐，TaskCenter 到点直接发送。' },
  { value: 'feishu_card_v1', title: '飞书卡片 V1', note: '兼容模式，V2 不稳定时手动切换。' },
  { value: 'openclaw_cron_agent', title: 'AI 提醒', note: '保存后创建 OpenClaw 定时 Agent 任务。' },
];

const receiveIdTypes: Array<{ value: ReminderReceiveIdType; label: string }> = [
  { value: 'open_id', label: 'open_id 用户' },
  { value: 'chat_id', label: 'chat_id 群聊' },
  { value: 'user_id', label: 'user_id 用户' },
  { value: 'union_id', label: 'union_id 用户' },
  { value: 'email', label: 'email 用户' },
];

export function ReminderSettingsSheet({
  task,
  draft,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  task: Task;
  draft: ReminderFormState;
  busy: boolean;
  onChange: (draft: ReminderFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="overlay">
      <div className="sheet reminder-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            返回
          </button>
          <strong>提醒设置</strong>
          <span className="muted-text">#{task.id}</span>
        </div>

        <div className="filter-form reminder-form">
          <section className="editor-card reminder-mode-card">
            <div className="editor-card-head">
              <div>
                <div className="editor-label">提醒方式</div>
                <strong className="editor-card-title">{deliveryModes.find((mode) => mode.value === draft.delivery_mode)?.title}</strong>
                <p className="editor-card-note">普通提醒由 TaskCenter 直接发送；只有需要模型处理时才选择 AI 提醒。</p>
              </div>
            </div>
            <div className="reminder-mode-grid">
              {deliveryModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={draft.delivery_mode === mode.value ? 'reminder-mode-option reminder-mode-option-active' : 'reminder-mode-option'}
                  onClick={() => {
                    const next = { ...draft, delivery_mode: mode.value };
                    if (mode.value === 'openclaw_cron_agent' && !next.ai_prompt.trim()) {
                      next.ai_prompt = buildDefaultAiPrompt(task, next.remind_at);
                    }
                    onChange(next);
                  }}
                >
                  <strong>{mode.title}</strong>
                  <span>{mode.note}</span>
                </button>
              ))}
            </div>
          </section>

          <label>
            <span>提醒时间</span>
            <input type="datetime-local" value={draft.remind_at} onChange={(event) => onChange({ ...draft, remind_at: event.target.value })} />
          </label>

          <label>
            <span>发送备注（可选）</span>
            <textarea rows={3} value={draft.note} onChange={(event) => onChange({ ...draft, note: event.target.value })} placeholder="会显示在飞书任务卡片里。" />
          </label>

          <div className="editor-grid editor-grid-two">
            <label>
              <span>接收 ID 类型</span>
              <select value={draft.receive_id_type} onChange={(event) => onChange({ ...draft, receive_id_type: event.target.value as ReminderReceiveIdType })}>
                {receiveIdTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>接收 ID</span>
              <input value={draft.receive_id} onChange={(event) => onChange({ ...draft, receive_id: event.target.value })} placeholder={draft.delivery_mode === 'openclaw_cron_agent' ? 'AI 提醒必填' : '留空用后端默认目标'} />
            </label>
          </div>

          {draft.delivery_mode === 'openclaw_cron_agent' && (
            <label>
              <span>AI Prompt</span>
              <textarea rows={10} value={draft.ai_prompt} onChange={(event) => onChange({ ...draft, ai_prompt: event.target.value })} />
            </label>
          )}

          {task.reminders?.[0]?.last_error && (
            <div className="reminder-error-box">
              <strong>最近错误</strong>
              <span>{task.reminders[0].last_error}</span>
            </div>
          )}
        </div>

        <button type="button" className="primary-submit" onClick={onSubmit} disabled={busy}>
          {busy ? '保存中…' : draft.id ? '保存提醒' : '创建提醒'}
        </button>
      </div>
    </div>
  );
}
