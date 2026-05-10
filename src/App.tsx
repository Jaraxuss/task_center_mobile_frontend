import { useMemo, useState } from 'react';
import { api } from './api';
import { useAsyncData, usePersistentState } from './hooks';
import {
  BOARD_CONTENT_MAX_DEFAULT,
  clampBoardContentMaxLength,
  formatDateTimeInput,
  getHistoryDateGroups,
  groupMaterialsByBatch,
  makeFactFormState,
  makeTaskFormState,
  parseRouteState,
  sortKnowledgeCustomersWithPreference,
  sortProjectGroupsWithPreference,
  sortTasksWithPreference,
  statusOrder,
  toIsoOrNull,
} from './lib';
import type {
  BoardMode,
  FactFormState,
  KnowledgeMode,
  MaterialFormState,
  TabKey,
  TaskFormState,
} from './lib';
import { StateCard } from './components';
import {
  FactCustomerPickerSheet,
  FactEditorSheet,
  HistoryFilterSheet,
  MaterialEditorSheet,
  SettingsSheet,
  TaskActionSheet,
  TaskDetailSheet,
  TaskEditorSheet,
  type ActionSheetState,
  type TaskFormMode,
  type ThemeMode,
} from './sheets';
import {
  BoardGroupItem,
  BoardHero,
  HistoryDaySection,
  HistoryHero,
  KnowledgeFactCustomerCard,
  KnowledgeHero,
  MaterialBatchGroupSection,
  PlanDaySection,
  PlanHero,
  TaskGroupSection,
  TodayHero,
} from './views';
import { useAppHandlers, useAppSideEffects } from './useAppHandlers';
import { BoardPreferences, Customer, CustomerMaterialStatus, DashboardBoardGroup, Fact, FactStatus, KnowledgeFactsOverview, KnowledgePreferences, PlanGroup, Task, TaskStatus } from './types';
import { TimeFormatMode, groupTasksByProject, groupTodayTasks, sortTasksByUpdated } from './utils';

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'today', label: '今日', icon: '◉' },
  { key: 'plan', label: '计划', icon: '☷' },
  { key: 'board', label: '看板', icon: '▣' },
  { key: 'knowledge', label: '知识', icon: '◇' },
  { key: 'history', label: '历史', icon: '↺' },
];

const boardGroupDescriptions: Record<TaskStatus, string> = {
  todo: '还没开动，但已经进入手里这盘活。先排优先级，再决定谁先推进。',
  doing: '已经在动的事项，适合快速扫一眼当前推进面。',
  deferred: '不是不做，只是被顺延。定期回看，别让它们长期漂着。',
  done: '已经收口的事项，保留回看价值，但不该抢当前注意力。',
  canceled: '明确停止推进的事项，留作判断记录，不再投入精力。',
};

function App() {
  const initialRoute = parseRouteState();
  const [activeTab, setActiveTab] = useState<TabKey>(initialRoute.tab);
  const [boardMode, setBoardMode] = useState<BoardMode>(initialRoute.boardMode);
  const [theme, setTheme] = usePersistentState<ThemeMode>('task-center-mobile-theme', 'light');
  const [timeFormat, setTimeFormat] = usePersistentState<TimeFormatMode>('task-center-mobile-time-format', 'cn-short');
  const [boardContentMaxLength, setBoardContentMaxLength] = usePersistentState<number>('task-center-mobile-board-content-max-length', BOARD_CONTENT_MAX_DEFAULT);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [historyDraft, setHistoryDraft] = useState(initialRoute.historyDraft);
  const [historyFilters, setHistoryFilters] = useState(initialRoute.historyDraft);
  const [visibleProjectGroupCount, setVisibleProjectGroupCount] = useState(6);
  const [visibleHistoryGroupCount, setVisibleHistoryGroupCount] = useState(6);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'default' | 'success' | 'danger' } | null>(null);
  const [actionSheet, setActionSheet] = useState<ActionSheetState | null>(null);
  const [editorMode, setEditorMode] = useState<TaskFormMode | null>(null);
  const [editorDraft, setEditorDraft] = useState<TaskFormState>(makeTaskFormState());
  const [materialDraft, setMaterialDraft] = useState<MaterialFormState | null>(null);
  const [materialStatusFilter, setMaterialStatusFilter] = useState<CustomerMaterialStatus | ''>('');
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>(initialRoute.knowledgeMode);
  const [factDraft, setFactDraft] = useState<FactFormState | null>(null);
  const [factStatusFilter, setFactStatusFilter] = useState<FactStatus | ''>('');
  const [factSheetOverTask, setFactSheetOverTask] = useState(false);
  const [factCustomerPickerOpen, setFactCustomerPickerOpen] = useState(false);
  const [materialFactsLoading, setMaterialFactsLoading] = useState(false);
  const [materialFactIds, setMaterialFactIds] = useState<number[]>([]);
  const [materialLinkedFacts, setMaterialLinkedFacts] = useState<Fact[]>([]);
  const [currentFact, setCurrentFact] = useState<Fact | null>(null);
  const [boardProjectQuery, setBoardProjectQuery] = useState('');
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<string[]>([]);
  const [expandedStatusKeys, setExpandedStatusKeys] = useState<string[]>(statusOrder);
  const [knowledgeProjectFacts, setKnowledgeProjectFacts] = useState<Record<string, Fact[]>>({});
  const [knowledgeProjectFactsLoading, setKnowledgeProjectFactsLoading] = useState<Record<string, boolean>>({});
  const [knowledgeCustomerQuery, setKnowledgeCustomerQuery] = useState('');
  const [expandedKnowledgeCustomerIds, setExpandedKnowledgeCustomerIds] = useState<number[]>([]);
  const [expandedKnowledgeProjectKeys, setExpandedKnowledgeProjectKeys] = useState<string[]>([]);

  const today = useAsyncData(() => api.getTodayDashboard(), [], activeTab === 'today');
  const plan = useAsyncData(() => api.getPlanDashboard(), [], activeTab === 'plan');
  const board = useAsyncData(() => api.getBoardDashboard(), [], activeTab === 'board');
  const allTasks = useAsyncData(() => api.getTasks(), [], activeTab === 'board');
  const projectSummaries = useAsyncData(() => api.getProjectSummaries(), [], activeTab === 'board');
  const projects = useAsyncData(() => api.getProjects(), [], editorMode !== null || materialDraft !== null);
  const boardPreferences = useAsyncData(() => api.getBoardPreferences(), [], activeTab === 'board');
  const knowledgePreferences = useAsyncData(() => api.getKnowledgePreferences(), [], activeTab === 'knowledge');
  const knowledgeFactOverview = useAsyncData(
    () => api.getKnowledgeFactsOverview({ status: factStatusFilter }),
    [factStatusFilter],
    activeTab === 'knowledge',
  );
  const customerMaterials = useAsyncData(
    () => api.getCustomerMaterials({ limit: 300 }),
    [],
    activeTab === 'knowledge' && knowledgeMode === 'materials',
  );
  const reviewBatches = useAsyncData(
    () => api.getReviewBatches(),
    [],
    activeTab === 'knowledge' && knowledgeMode === 'materials',
  );
  const customers = useAsyncData(
    () => api.getCustomers(),
    [],
    activeTab === 'knowledge' || factDraft !== null,
  );
  const taskMaterials = useAsyncData(
    () => (selectedTask ? api.getTaskCustomerMaterials(selectedTask.id) : Promise.resolve([])),
    [selectedTask?.id],
    Boolean(selectedTask),
  );
  const taskFacts = useAsyncData(
    () => (selectedTask ? api.getTaskFacts(selectedTask.id) : Promise.resolve([])),
    [selectedTask?.id],
    Boolean(selectedTask),
  );
  const history = useAsyncData(
    () => api.getHistoryDashboard({ q: historyFilters.q || undefined, status: historyFilters.status || undefined, date: historyFilters.date || undefined }),
    [historyFilters.q, historyFilters.status, historyFilters.date],
    activeTab === 'history',
  );

  const boardPreferenceData: BoardPreferences = boardPreferences.data || { task_order: [], pinned_projects: [], project_order: [] };
  const orderedBoardStatusGroups = useMemo(
    () => (board.data?.groups || []).map((group: DashboardBoardGroup) => ({ ...group, tasks: sortTasksWithPreference(group.tasks, boardPreferenceData.task_order) })),
    [board.data?.groups, boardPreferenceData.task_order],
  );
  const orderedBoardTasks = useMemo(() => sortTasksWithPreference(allTasks.data || [], boardPreferenceData.task_order), [allTasks.data, boardPreferenceData.task_order]);
  const boardStatusGroups = orderedBoardStatusGroups;
  const boardProjectGroups = useMemo(
    () => sortProjectGroupsWithPreference(groupTasksByProject(orderedBoardTasks), boardPreferenceData.pinned_projects, boardPreferenceData.project_order),
    [orderedBoardTasks, boardPreferenceData.pinned_projects, boardPreferenceData.project_order],
  );
  const filteredProjectGroups = useMemo(() => {
    const query = boardProjectQuery.trim().toLowerCase();
    if (!query) return boardProjectGroups;
    return boardProjectGroups.filter((group) => group.title.toLowerCase().includes(query));
  }, [boardProjectGroups, boardProjectQuery]);
  const visibleProjectGroups = useMemo(() => filteredProjectGroups.slice(0, visibleProjectGroupCount), [filteredProjectGroups, visibleProjectGroupCount]);
  const boardGroups = boardMode === 'status' ? boardStatusGroups : visibleProjectGroups;
  const hasMoreProjectGroups = boardMode === 'project' && visibleProjectGroupCount < filteredProjectGroups.length;
  const historyItems = useMemo(() => sortTasksByUpdated(history.data?.items || []), [history.data]);
  const rawMaterialItems = customerMaterials.data || [];
  const materialItems = useMemo(() => (materialStatusFilter ? rawMaterialItems.filter((material) => material.status === materialStatusFilter) : rawMaterialItems), [rawMaterialItems, materialStatusFilter]);
  const materialGroups = useMemo(
    () => groupMaterialsByBatch(materialItems, reviewBatches.data || []),
    [materialItems, reviewBatches.data],
  );
  const overviewData: KnowledgeFactsOverview = knowledgeFactOverview.data || { total_fact_count: 0, customers: [] };
  const knowledgePrefData: KnowledgePreferences = knowledgePreferences.data || { pinned_customer_ids: [], customer_order_ids: [] };

  const filteredOverviewCustomers = useMemo(() => {
    const query = knowledgeCustomerQuery.trim().toLowerCase();
    let list = [...overviewData.customers];
    if (query) {
      list = list.filter((c) => c.customer_name.toLowerCase().includes(query));
    }
    return sortKnowledgeCustomersWithPreference(list, knowledgePrefData.pinned_customer_ids, knowledgePrefData.customer_order_ids);
  }, [overviewData.customers, knowledgeCustomerQuery, knowledgePrefData]);
  const customerMap = useMemo(() => {
    const map = new Map<number, Customer>();
    (customers.data || []).forEach((c) => map.set(c.id, c));
    return map;
  }, [customers.data]);
  const historyDateGroups = useMemo(() => getHistoryDateGroups(historyItems), [historyItems]);
  const visibleHistoryGroups = useMemo(() => historyDateGroups.slice(0, visibleHistoryGroupCount), [historyDateGroups, visibleHistoryGroupCount]);
  const hasMoreHistoryGroups = visibleHistoryGroupCount < historyDateGroups.length;

  const { projectLoadMoreRef, historyLoadMoreRef } = useAppSideEffects({
    theme, timeFormat, boardContentMaxLength, setBoardContentMaxLength,
    activeTab, boardMode, knowledgeMode, historyFilters,
    setActiveTab, setBoardMode, setKnowledgeMode, setHistoryDraft, setHistoryFilters,
    toast, setToast: () => setToast(null),
    filteredProjectGroups, boardStatusGroups,
    setVisibleProjectGroupCount, setExpandedProjectKeys,
    hasMoreProjectGroups,
    historyData: history.data, setVisibleHistoryGroupCount,
    hasMoreHistoryGroups, historyDateGroups,
    factStatusFilter, setKnowledgeProjectFacts,
  });

  const {
    openTask, runTaskAction, submitEditor, submitMaterialEditor,
    updateMaterialStatus, archiveMaterial, openMaterialDraft,
    submitFactEditor, updateFactStatusById, deleteFactById,
    updateFactCustomerById, openFactById,
    handleMoveProjectGroup, handleTogglePinnedProject,
    handleTogglePinnedKnowledgeCustomer, handleMoveKnowledgeCustomer,
    loadProjectFacts,
  } = useAppHandlers({
    today, plan, board, allTasks, history, projects, boardPreferences,
    knowledgePreferences, customerMaterials, reviewBatches, customers,
    taskMaterials, taskFacts, knowledgeFactOverview,
    activeTab, knowledgeMode,
    selectedTask, setSelectedTask, setDetailLoading,
    setToast, actionBusy, setActionBusy,
    actionSheet, setActionSheet,
    editorMode, editorDraft, setEditorMode, setEditorDraft,
    materialDraft, setMaterialDraft,
    factDraft, setFactDraft,
    factStatusFilter,
    setFactSheetOverTask, setFactCustomerPickerOpen,
    currentFact, setCurrentFact,
    boardPreferenceData, knowledgePrefData,
    boardProjectGroups, filteredOverviewCustomers,
    knowledgeProjectFacts, setKnowledgeProjectFacts, setKnowledgeProjectFactsLoading,
    setMaterialFactsLoading, setMaterialFactIds, setMaterialLinkedFacts,
  });

  const todayData = today.data;
  const planData = plan.data;
  const todayGroups = useMemo(() => groupTodayTasks(todayData?.tasks || [], todayData?.date), [todayData]);
  const planGroups = useMemo(() => {
    if (!planData) return [] as PlanGroup[];
    return planData.planGroups || [];
  }, [planData]);
  const summary = todayData?.summary;

  return (
    <div className="app-shell">
      <main className="content">
        {activeTab === 'today' && (
          <section className="page">
            <TodayHero
              summary={summary}
              groups={todayGroups}
              onCreateTask={() => {
                setEditorDraft(makeTaskFormState());
                setEditorMode('create');
              }}
              onOpenPlan={() => setActiveTab('plan')}
              onOpenTask={openTask}
            />
            {today.loading && !today.loaded && <StateCard text="正在加载今日任务…" />}
            {today.error && <StateCard text={today.error} tone="danger" />}
            {!today.loading && !today.error && today.loaded && (
              <>
                {todayGroups.overdue.length === 0 && todayGroups.dueToday.length === 0 && todayGroups.later.length === 0 && todayGroups.completed.length === 0 && (
                  <StateCard text="今天暂时没有待处理任务，节奏还算稳。" />
                )}
                <TaskGroupSection title="逾期" description="已经过点的事，先止血，再排今天后面的活。" tasks={todayGroups.overdue} accent="danger" onOpenTask={openTask} hideWhenEmpty variant="today" />
                <TaskGroupSection title="今天到期" description="今天还没到点、但今天必须收口的事项。" tasks={todayGroups.dueToday} accent="warning" onOpenTask={openTask} hideWhenEmpty variant="today" />
                <TaskGroupSection title="稍后处理" description="暂时不在最前面，但也别让它们消失。" tasks={todayGroups.later} accent="muted" onOpenTask={openTask} hideWhenEmpty variant="today" />
                <TaskGroupSection title="已完成" description="今天已经收口的事项，默认折叠。" tasks={todayGroups.completed} accent="success" defaultCollapsed onOpenTask={openTask} hideWhenEmpty variant="today" />
              </>
            )}
          </section>
        )}

        {activeTab === 'plan' && (
          <section className="page">
            <PlanHero groups={planGroups} />
            {plan.loading && !plan.loaded && <StateCard text="正在加载计划视图…" />}
            {plan.error && <StateCard text={plan.error} tone="danger" />}
            {!plan.loading && !plan.error && plan.loaded && planGroups.length === 0 && <StateCard text="当前没有未来事项" />}
            {!plan.loading && !plan.error && planGroups.map((group: PlanGroup, index: number) => <PlanDaySection key={group.key} group={group} onOpenTask={openTask} index={index} />)}
          </section>
        )}

        {activeTab === 'board' && (
          <section className="page">
            <BoardHero
              mode={boardMode}
              projects={projectSummaries.data || []}
              projectQuery={boardProjectQuery}
              allGroupsExpanded={boardMode === 'project'
                ? filteredProjectGroups.length > 0 && filteredProjectGroups.every((group: { key: string }) => expandedProjectKeys.includes(group.key))
                : boardStatusGroups.length > 0 && boardStatusGroups.every((group: DashboardBoardGroup) => expandedStatusKeys.includes(group.key))}
              onProjectQueryChange={setBoardProjectQuery}
              onToggleGroupCollapse={() => {
                if (boardMode === 'project') {
                  const allExpanded = filteredProjectGroups.length > 0 && filteredProjectGroups.every((group: { key: string }) => expandedProjectKeys.includes(group.key));
                  setExpandedProjectKeys(allExpanded ? [] : filteredProjectGroups.map((group: { key: string }) => group.key));
                  return;
                }
                const allExpanded = boardStatusGroups.length > 0 && boardStatusGroups.every((group: DashboardBoardGroup) => expandedStatusKeys.includes(group.key));
                setExpandedStatusKeys(allExpanded ? [] : boardStatusGroups.map((group: DashboardBoardGroup) => group.key));
              }}
              onChangeMode={setBoardMode}
            />
            {((boardMode === 'status' && board.loading && !board.loaded) || (boardMode === 'project' && allTasks.loading && !allTasks.loaded)) && <StateCard text="看板加载中…" />}
            {(board.error || allTasks.error || boardPreferences.error) && <StateCard text={board.error || allTasks.error || boardPreferences.error || '加载失败'} tone="danger" />}
            {!board.error && !allTasks.error && !boardPreferences.error && board.loaded && allTasks.loaded && boardGroups.length === 0 && <StateCard text={boardMode === 'project' && boardProjectQuery ? '没有匹配的客户 / 项目' : '当前没有可展示的任务'} />}
            {!board.error && !allTasks.error && boardGroups.map((group: DashboardBoardGroup | { key: string; title: string; tasks: Task[] }) => (
              <BoardGroupItem
                key={group.key}
                group={group}
                boardMode={boardMode}
                boardGroupDescriptions={boardGroupDescriptions}
                boardPreferenceData={boardPreferenceData}
                boardProjectGroups={boardProjectGroups}
                expandedProjectKeys={expandedProjectKeys}
                expandedStatusKeys={expandedStatusKeys}
                boardContentMaxLength={boardContentMaxLength}
                onOpenTask={openTask}
                onToggleProjectKey={(key) => setExpandedProjectKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
                onToggleStatusKey={(key) => setExpandedStatusKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
                onMoveProjectGroup={(title, dir) => void handleMoveProjectGroup(title, dir)}
                onTogglePinnedProject={(title) => void handleTogglePinnedProject(title)}
              />
            ))}
            {boardMode === 'project' && hasMoreProjectGroups && (
              <div ref={projectLoadMoreRef} className="scroll-load-sentinel" aria-hidden="true">
                <span className="scroll-load-chip">继续下滑，自动加载更多客户</span>
              </div>
            )}
          </section>
        )}

        {activeTab === 'knowledge' && (
          <section className="page">
            <KnowledgeHero
              mode={knowledgeMode}
              onChangeMode={setKnowledgeMode}
              materialCount={rawMaterialItems.length}
              factCount={overviewData.total_fact_count}
              overviewLoading={knowledgeFactOverview.loading && !knowledgeFactOverview.loaded}
              statusFilter={knowledgeMode === 'materials' ? materialStatusFilter : ''}
              onMaterialStatusFilterChange={setMaterialStatusFilter}
              factStatusFilter={factStatusFilter}
              onFactStatusFilterChange={setFactStatusFilter}
            />

            {knowledgeMode === 'materials' && (
              <>
                {customerMaterials.loading && !customerMaterials.loaded && <StateCard text="客户材料加载中…" />}
                {customerMaterials.error && <StateCard text={customerMaterials.error} tone="danger" />}
                {!customerMaterials.loading && !customerMaterials.error && customerMaterials.loaded && materialItems.length === 0 && (
                  <StateCard text="当前没有客户材料。周期材料由周日 20:00 cron 自动生成。" />
                )}
                {!customerMaterials.error && materialGroups.map((group) => (
                  <MaterialBatchGroupSection
                    key={group.key}
                    batch={group.batch}
                    materials={group.materials}
                    customerMap={customerMap}
                    onOpen={openMaterialDraft}
                  />
                ))}
              </>
            )}

            {knowledgeMode === 'facts' && (
              <>
                {knowledgeFactOverview.loading && !knowledgeFactOverview.loaded && <StateCard text="事实加载中…" />}
                {knowledgeFactOverview.error && <StateCard text={knowledgeFactOverview.error} tone="danger" />}
                {!knowledgeFactOverview.loading && !knowledgeFactOverview.error && knowledgeFactOverview.loaded && overviewData.customers.length === 0 && (
                  <StateCard text="当前没有客户事实。由主代理在转发 / 截图 / 会议纪要场景写入。" />
                )}

                {!knowledgeFactOverview.error && knowledgeFactOverview.loaded && (
                  <div className="knowledge-customer-search-shell board-search-shell">
                    <span className="board-search-icon" aria-hidden="true">⌕</span>
                    <input
                      className="board-search-input"
                      value={knowledgeCustomerQuery}
                      onChange={(event) => setKnowledgeCustomerQuery(event.target.value)}
                      placeholder="搜索客户"
                    />
                    {knowledgeCustomerQuery ? (
                      <button type="button" className="board-search-clear" onClick={() => setKnowledgeCustomerQuery('')} aria-label="清空搜索">×</button>
                    ) : null}
                  </div>
                )}
                {!knowledgeFactOverview.error && filteredOverviewCustomers.length === 0 && knowledgeFactOverview.loaded && overviewData.customers.length > 0 && (
                  <StateCard text="没有匹配的客户" />
                )}
                {!knowledgeFactOverview.error && filteredOverviewCustomers.map((cust) => {
                  const cid = cust.customer_id;
                  const pinned = cid != null && knowledgePrefData.pinned_customer_ids.includes(cid);
                  const visibleIds = filteredOverviewCustomers.map((c) => c.customer_id).filter((id) => id != null) as number[];
                  const canMoveUp = cid != null && visibleIds.indexOf(cid) > 0;
                  const canMoveDown = cid != null && visibleIds.indexOf(cid) < visibleIds.length - 1;
                  return (
                    <KnowledgeFactCustomerCard
                      key={cid ?? 'no-customer'}
                      customerOverview={cust}
                      pinned={pinned}
                      canMoveUp={canMoveUp}
                      canMoveDown={canMoveDown}
                      expanded={expandedKnowledgeCustomerIds.includes(cid ?? -1)}
                      expandedProjectKeys={expandedKnowledgeProjectKeys}
                      projectFacts={knowledgeProjectFacts}
                      projectFactsLoading={knowledgeProjectFactsLoading}
                      onToggleCollapsed={() => setExpandedKnowledgeCustomerIds((prev) => prev.includes(cid ?? -1) ? prev.filter((id) => id !== (cid ?? -1)) : [...prev, (cid ?? -1)])}
                      onTogglePinned={() => { if (cid != null) void handleTogglePinnedKnowledgeCustomer(cid); }}
                      onMoveUp={() => { if (cid != null) void handleMoveKnowledgeCustomer(cid, 'up'); }}
                      onMoveDown={() => { if (cid != null) void handleMoveKnowledgeCustomer(cid, 'down'); }}
                      onToggleProject={(projectKey) => setExpandedKnowledgeProjectKeys((prev) => prev.includes(projectKey) ? prev.filter((k) => k !== projectKey) : [...prev, projectKey])}
                      onLoadProjectFacts={(customerId, projectId) => { void loadProjectFacts(customerId, projectId); }}
                      onOpenFact={(fact: Fact) => {
                        setCurrentFact(fact);
                        setFactDraft(makeFactFormState(fact));
                      }}
                    />
                  );
                })}
              </>
            )}
          </section>
        )}

        {activeTab === 'history' && (
          <section className="page">
            <HistoryHero
              items={historyItems}
              filters={historyFilters}
              onOpenFilter={() => setShowHistoryFilter(true)}
              onResetFilters={() => {
                const next = { q: '', status: '', date: '' };
                setHistoryDraft(next);
                setHistoryFilters(next);
              }}
            />
            {history.loading && !history.loaded && <StateCard text="历史记录加载中…" />}
            {history.error && <StateCard text={history.error} tone="danger" />}
            {!history.loading && !history.error && history.loaded && historyItems.length === 0 && <StateCard text="没有符合条件的历史记录" />}
            {!history.loading && !history.error && history.loaded && visibleHistoryGroups.map((group) => (
              <HistoryDaySection key={group.key} title={group.title} tasks={group.tasks} total={history.data?.total || historyItems.length} onOpenTask={openTask} showTotal={group.key === visibleHistoryGroups[0]?.key} />
            ))}
            {!history.loading && !history.error && history.loaded && hasMoreHistoryGroups && (
              <div ref={historyLoadMoreRef} className="scroll-load-sentinel" aria-hidden="true">
                <span className="scroll-load-chip">继续下滑，自动加载更多历史记录</span>
              </div>
            )}
          </section>
        )}
      </main>

      <nav className="bottom-nav bottom-nav-six">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={tab.key === activeTab && !showSettings ? 'nav-item nav-item-active' : 'nav-item'}
            onClick={() => {
              setShowSettings(false);
              setActiveTab(tab.key);
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <button type="button" className={showSettings ? 'nav-item nav-item-active' : 'nav-item'} onClick={() => setShowSettings(true)}>
          <span>⚙</span>
          <span>设置</span>
        </button>
      </nav>

      {selectedTask && !(factDraft && factSheetOverTask) && (
        <TaskDetailSheet
          task={selectedTask}
          loading={detailLoading}
          materials={taskMaterials.data || []}
          materialsLoading={taskMaterials.loading}
          facts={taskFacts.data || []}
          factsLoading={taskFacts.loading}
          customerMap={customerMap}
          busyAction={actionBusy}
          onClose={() => {
            setSelectedTask(null);
            setActionSheet(null);
          }}
          onAction={(type) => {
            setActionSheet({
              type,
              datetime: formatDateTimeInput(type === 'defer' ? selectedTask.deferred_to || selectedTask.due_at : selectedTask.due_at),
              reason: type === 'complete' ? selectedTask.completion_note || '' : '',
            });
          }}
          onEdit={() => {
            setEditorDraft(makeTaskFormState(selectedTask));
            setEditorMode('edit');
          }}
          onEditMaterial={openMaterialDraft}
          onOpenFact={(factId) => {
            setFactSheetOverTask(true);
            openFactById(factId);
          }}
        />
      )}

      {actionSheet && selectedTask && (
        <TaskActionSheet
          task={selectedTask}
          state={actionSheet}
          busyAction={actionBusy}
          onChange={setActionSheet}
          onClose={() => setActionSheet(null)}
          onSubmit={() => {
            if (actionSheet.type === 'complete') {
              void runTaskAction('complete', { reason: actionSheet.reason.trim() || undefined });
              return;
            }
            if (actionSheet.type === 'reschedule') {
              const dueAt = toIsoOrNull(actionSheet.datetime);
              if (!dueAt) {
                setToast({ text: '请选择有效时间', tone: 'danger' });
                return;
              }
              void runTaskAction('reschedule', { due_at: dueAt });
              return;
            }
            if (actionSheet.type === 'defer') {
              const dueAt = toIsoOrNull(actionSheet.datetime);
              if (!dueAt) {
                setToast({ text: '请选择延期时间', tone: 'danger' });
                return;
              }
              void runTaskAction('defer', { due_at: dueAt, deferred_to: dueAt, reason: actionSheet.reason.trim() || undefined });
              return;
            }
            void runTaskAction('cancel', { reason: actionSheet.reason.trim() || undefined });
          }}
        />
      )}

      {showHistoryFilter && (
        <HistoryFilterSheet
          draft={historyDraft}
          onChange={setHistoryDraft}
          onClose={() => setShowHistoryFilter(false)}
          onApply={() => {
            setHistoryFilters(historyDraft);
            setShowHistoryFilter(false);
          }}
          onReset={() => {
            const next = { q: '', status: '', date: '' };
            setHistoryDraft(next);
            setHistoryFilters(next);
            setShowHistoryFilter(false);
          }}
        />
      )}

      {showSettings && (
        <SettingsSheet
          theme={theme}
          timeFormat={timeFormat}
          boardContentMaxLength={boardContentMaxLength}
          onClose={() => setShowSettings(false)}
          onThemeChange={setTheme}
          onTimeFormatChange={setTimeFormat}
          onBoardContentMaxLengthChange={(value) => setBoardContentMaxLength(clampBoardContentMaxLength(value))}
        />
      )}

      {editorMode && (
        <TaskEditorSheet
          mode={editorMode}
          draft={editorDraft}
          onChange={setEditorDraft}
          onClose={() => setEditorMode(null)}
          onSubmit={() => void submitEditor()}
          busy={actionBusy === 'create' || actionBusy === 'edit'}
          projects={projects.data || []}
          customers={customers.data || []}
        />
      )}

      {materialDraft && (() => {
        const material = rawMaterialItems.find((m) => m.id === materialDraft.id) ?? null;
        const batch = material?.review_batch_id != null
          ? (reviewBatches.data || []).find((b) => b.id === material.review_batch_id) ?? null
          : null;
        const customer = material?.customer_id != null ? customerMap.get(material.customer_id) ?? null : null;
        const projMatch = material?.project_v2_id != null
          ? (projects.data || []).find((p) => p.id === material.project_v2_id)
          : null;
        const linkedFacts = materialLinkedFacts;
        return (
          <MaterialEditorSheet
            draft={materialDraft}
            material={material}
            batch={batch}
            customer={customer}
            projectName={projMatch?.name ?? null}
            linkedFacts={linkedFacts}
            factsLoading={materialFactsLoading}
            onChange={(next) => setMaterialDraft(next)}
            onClose={() => setMaterialDraft(null)}
            onSubmit={() => void submitMaterialEditor()}
            onStatusChange={(status) => {
              if (material) void updateMaterialStatus(material, status);
            }}
            onArchive={() => {
              if (material) void archiveMaterial(material);
            }}
            onOpenFact={openFactById}
            busy={actionBusy === 'material'}
          />
        );
      })()}

      {factDraft && (factSheetOverTask || !selectedTask) && (() => {
        const fact = currentFact
          ?? (taskFacts.data || []).find((f: Fact) => f.id === factDraft.id)
          ?? null;
        const customer = fact?.customer_id != null ? customerMap.get(fact.customer_id) ?? null : null;
        return (
          <FactEditorSheet
            draft={factDraft}
            fact={fact}
            customer={customer}
            onChange={(next) => setFactDraft(next)}
            onClose={() => {
              setFactDraft(null);
              setCurrentFact(null);
              setFactSheetOverTask(false);
              setFactCustomerPickerOpen(false);
            }}
            onSubmit={() => void submitFactEditor()}
            onStatusChange={(status) => void updateFactStatusById(factDraft.id, status)}
            onDelete={() => void deleteFactById(factDraft.id)}
            onOpenTask={(taskId) => {
              // Keep factDraft so the fact sheet re-renders after the task sheet is closed.
              setFactSheetOverTask(false);
              setDetailLoading(true);
              api.getTask(taskId)
                .then((task) => setSelectedTask(task))
                .catch(() => setToast({ text: '\u65e0\u6cd5\u6253\u5f00\u5173\u8054\u4efb\u52a1', tone: 'danger' }))
                .finally(() => setDetailLoading(false));
            }}
            onOpenCustomerPicker={() => setFactCustomerPickerOpen(true)}
            busy={actionBusy === 'fact' || actionBusy === `fact-${factDraft.id}`}
          />
        );
      })()}

      {factDraft && factCustomerPickerOpen && (
        <FactCustomerPickerSheet
          customers={customers.data || []}
          currentCustomerId={currentFact?.customer_id
            ?? (taskFacts.data || []).find((f: Fact) => f.id === factDraft.id)?.customer_id
            ?? null}
          busy={actionBusy === `fact-${factDraft.id}`}
          onClose={() => setFactCustomerPickerOpen(false)}
          onSelect={async (customerId) => {
            await updateFactCustomerById(factDraft.id, customerId);
            setFactCustomerPickerOpen(false);
          }}
        />
      )}

      {toast && <div className={toast.tone === 'danger' ? 'toast toast-danger' : toast.tone === 'success' ? 'toast toast-success' : 'toast'}>{toast.text}</div>}
    </div>
  );
}


export default App;

