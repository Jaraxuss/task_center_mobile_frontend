import { ExpandToggleIcon } from '../components';
import type { BoardMode } from '../lib';
import { ProjectSummary } from '../types';

export function BoardHero({
  mode,
  projects,
  projectQuery,
  allGroupsExpanded,
  onProjectQueryChange,
  onToggleGroupCollapse,
  onChangeMode,
}: {
  mode: BoardMode;
  projects: ProjectSummary[];
  projectQuery: string;
  allGroupsExpanded: boolean;
  onProjectQueryChange: (value: string) => void;
  onToggleGroupCollapse: () => void;
  onChangeMode: (mode: BoardMode) => void;
}) {
  return (
    <section className="today-hero card-section accent-brand-soft board-hero-compact">
      <div className="board-hero-topline">
        <div className="today-hero-heading board-hero-heading-compact">
          <span className="topbar-kicker today-hero-kicker">看板视图</span>
          <h2>{mode === 'status' ? '按状态扫盘' : '按客户收线'}</h2>
          <p>{mode === 'status' ? '先看推进面，再决定今天先动哪一块。' : '搜客户、调顺序，把一条线集中收干净。'}</p>
        </div>

        <div className="board-mode-toolbar" aria-label="看板模式与分组展开控制">
          <div className="board-segmented board-segmented-compact board-segmented-flex" role="tablist" aria-label="看板分组方式">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'status'}
              className={mode === 'status' ? 'board-segment board-segment-active' : 'board-segment'}
              onClick={() => onChangeMode('status')}
            >
              按状态
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'project'}
              className={mode === 'project' ? 'board-segment board-segment-active' : 'board-segment'}
              onClick={() => onChangeMode('project')}
            >
              按客户
            </button>
          </div>

          <span className="board-mode-toolbar-divider" aria-hidden="true"></span>
          <button
            type="button"
            className="board-mode-toolbar-action"
            onClick={onToggleGroupCollapse}
            aria-label={mode === 'project'
              ? (allGroupsExpanded ? '全部折叠客户' : '全部展开客户')
              : (allGroupsExpanded ? '全部折叠状态分组' : '全部展开状态分组')}
            title={mode === 'project'
              ? (allGroupsExpanded ? '全部折叠客户' : '全部展开客户')
              : (allGroupsExpanded ? '全部折叠状态分组' : '全部展开状态分组')}
          >
            <ExpandToggleIcon expanded={allGroupsExpanded} />
          </button>
        </div>
      </div>

      {mode === 'project' && projects.length > 0 ? (
        <div className="board-hero-tools board-hero-tools-compact">
          <div className="board-search-shell">
            <span className="board-search-icon" aria-hidden="true">⌕</span>
            <input
              className="board-search-input"
              value={projectQuery}
              onChange={(event) => onProjectQueryChange(event.target.value)}
              placeholder="搜索客户 / 项目"
            />
            {projectQuery ? (
              <button type="button" className="board-search-clear" onClick={() => onProjectQueryChange('')} aria-label="清空客户搜索">×</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
