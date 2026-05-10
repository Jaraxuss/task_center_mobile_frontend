import { BOARD_CONTENT_MAX_DEFAULT, BOARD_CONTENT_MAX_LIMIT, BOARD_CONTENT_MAX_MIN } from '../lib';
import { TimeFormatMode } from '../utils';

export type ThemeMode = 'light' | 'dark';

const timeFormatOptions: Array<{ value: TimeFormatMode; label: string; sample: string }> = [
  { value: 'cn-short', label: '月/日 24 小时', sample: '04/19 20:30' },
  { value: 'ymd-24', label: '年-月-日 24 小时', sample: '2026/04/19 20:30' },
  { value: 'slash-24', label: '年/月/日 24 小时', sample: '2026/04/19 20:30' },
];

export function SettingsSheet({
  theme,
  timeFormat,
  boardContentMaxLength,
  onClose,
  onThemeChange,
  onTimeFormatChange,
  onBoardContentMaxLengthChange,
}: {
  theme: ThemeMode;
  timeFormat: TimeFormatMode;
  boardContentMaxLength: number;
  onClose: () => void;
  onThemeChange: (value: ThemeMode) => void;
  onTimeFormatChange: (value: TimeFormatMode) => void;
  onBoardContentMaxLengthChange: (value: number) => void;
}) {
  return (
    <div className="overlay">
      <div className="sheet filter-sheet settings-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>关闭</button>
          <strong>设置</strong>
          <span className="muted-text">移动端</span>
        </div>
        <div className="settings-panel">
          <section className="settings-card">
            <div className="settings-card-copy">
              <span className="label-caption">主题</span>
              <strong>外观模式</strong>
              <p className="muted-text">白天看清楚，晚上别刺眼。</p>
            </div>
            <div className="settings-theme-row" role="tablist" aria-label="外观模式">
              <button type="button" className={theme === 'light' ? 'board-segment board-segment-active' : 'board-segment'} onClick={() => onThemeChange('light')}>日间</button>
              <button type="button" className={theme === 'dark' ? 'board-segment board-segment-active' : 'board-segment'} onClick={() => onThemeChange('dark')}>夜间</button>
            </div>
          </section>

          <label className="settings-card settings-field-card">
            <span className="label-caption">时间显示</span>
            <select value={timeFormat} onChange={(event) => onTimeFormatChange(event.target.value as TimeFormatMode)}>
              {timeFormatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} · {option.sample}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-card settings-field-card">
            <span className="label-caption">看板内容最大显示字符数</span>
            <input
              type="number"
              min={BOARD_CONTENT_MAX_MIN}
              max={BOARD_CONTENT_MAX_LIMIT}
              step={5}
              value={boardContentMaxLength}
              onChange={(event) => onBoardContentMaxLengthChange(Number(event.target.value))}
            />
            <span className="muted settings-helper-text">默认 {BOARD_CONTENT_MAX_DEFAULT}，允许 {BOARD_CONTENT_MAX_MIN} - {BOARD_CONTENT_MAX_LIMIT}，会自动保存。</span>
          </label>
        </div>
      </div>
    </div>
  );
}
