import { ExpandToggleIcon, MoveArrowIcon, PinIcon } from '../components';
import { TaskGroupSection } from './TaskGroupSection';
import type { BoardMode } from '../lib';
import { BoardPreferences, DashboardBoardGroup, ProjectSummary, Task, TaskStatus } from '../types';

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

export function BoardGroupItem({
  group,
  boardMode,
  boardGroupDescriptions,
  boardPreferenceData,
  boardProjectGroups,
  expandedProjectKeys,
  expandedStatusKeys,
  boardContentMaxLength,
  onOpenTask,
  onToggleProjectKey,
  onToggleStatusKey,
  onMoveProjectGroup,
  onTogglePinnedProject,
}: {
  group: DashboardBoardGroup | { key: string; title: string; tasks: Task[] };
  boardMode: BoardMode;
  boardGroupDescriptions: Record<TaskStatus, string>;
  boardPreferenceData: BoardPreferences;
  boardProjectGroups: Array<{ key: string; title: string; tasks: Task[] }>;
  expandedProjectKeys: string[];
  expandedStatusKeys: string[];
  boardContentMaxLength: number;
  onOpenTask: (task: Task) => void;
  onToggleProjectKey: (key: string) => void;
  onToggleStatusKey: (key: string) => void;
  onMoveProjectGroup: (title: string, direction: 'up' | 'down') => void;
  onTogglePinnedProject: (title: string) => void;
}) {
  const statusAccent = boardMode === 'status'
    ? ((group.key === 'todo'
        ? 'brand'
        : group.key === 'doing'
          ? 'plan'
          : group.key === 'deferred'
            ? 'warning'
            : group.key === 'done'
              ? 'success'
              : 'muted') as 'danger' | 'warning' | 'brand' | 'plan' | 'muted' | 'success' | 'board')
    : ((group.tasks.length > 0 ? 'plan' : 'muted') as 'danger' | 'warning' | 'brand' | 'plan' | 'muted' | 'success' | 'board');
  const description = boardMode === 'status'
    ? boardGroupDescriptions[group.key as TaskStatus]
    : undefined;
  const isProjectGroup = boardMode === 'project';
  const pinned = isProjectGroup && boardPreferenceData.pinned_projects.includes(group.title);
  const projectIndex = isProjectGroup ? boardProjectGroups.findIndex((item) => item.key === group.key) : -1;
  const previousProject = projectIndex > 0 ? boardProjectGroups[projectIndex - 1] : null;
  const nextProject = projectIndex >= 0 && projectIndex < boardProjectGroups.length - 1 ? boardProjectGroups[projectIndex + 1] : null;
  const canMoveProjectUp = Boolean(
    isProjectGroup
      && previousProject
      && boardPreferenceData.pinned_projects.includes(previousProject.title) === pinned,
  );
  const canMoveProjectDown = Boolean(
    isProjectGroup
      && nextProject
      && boardPreferenceData.pinned_projects.includes(nextProject.title) === pinned,
  );
  const statusCollapsed = !expandedStatusKeys.includes(group.key);

  return (
    <TaskGroupSection
      key={group.key}
      title={group.title}
      description={description}
      tasks={group.tasks}
      accent={statusAccent}
      onOpenTask={onOpenTask}
      variant="board"
      taskDescriptionMaxLength={boardContentMaxLength}
      collapsed={isProjectGroup ? !expandedProjectKeys.includes(group.key) : statusCollapsed}
      onToggleCollapsed={isProjectGroup
        ? () => onToggleProjectKey(group.key)
        : () => onToggleStatusKey(group.key)}
      countLabel={isProjectGroup ? String(group.tasks.length) : `${group.tasks.length} 项`}
      showToggleIcon={!isProjectGroup}
      actions={isProjectGroup ? (
        <div className="project-group-actions-grid">
          <button
            type="button"
            className="mini-icon-button project-group-action-button project-group-action-button-up"
            disabled={!canMoveProjectUp}
            onClick={() => onMoveProjectGroup(group.title, 'up')}
            aria-label={`上移客户 ${group.title}`}
          >
            <MoveArrowIcon direction="up" />
          </button>
          <button
            type="button"
            className={pinned
              ? 'mini-icon-button mini-icon-button-active project-group-action-button project-group-action-button-pin'
              : 'mini-icon-button project-group-action-button project-group-action-button-pin project-group-action-button-pin-inactive'}
            onClick={() => onTogglePinnedProject(group.title)}
            aria-label={pinned ? `取消置顶客户 ${group.title}` : `置顶客户 ${group.title}`}
          >
            {pinned ? <PinIcon active /> : <PinIcon active={false} />}
          </button>
          <button
            type="button"
            className="mini-icon-button project-group-action-button project-group-action-button-down"
            disabled={!canMoveProjectDown}
            onClick={() => onMoveProjectGroup(group.title, 'down')}
            aria-label={`下移客户 ${group.title}`}
          >
            <MoveArrowIcon direction="down" />
          </button>
        </div>
      ) : undefined}
    />
  );
}
