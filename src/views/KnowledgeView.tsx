import { useState } from 'react';
import { FactRow, MaterialRowWithCustomer, MoveArrowIcon, PinIcon, StateCard, factStatusLabelMap, materialStatusLabelMap } from '../components';
import type { KnowledgeMode } from '../lib';
import { Customer, CustomerMaterial, CustomerMaterialStatus, Fact, FactStatus, KnowledgeFactCustomerOverview, ReviewBatch } from '../types';
import { formatDateTimeShort } from '../utils';

const reviewBatchStatusLabelMap: Record<string, string> = {
  pending: '待审核',
  partial: '部分通过',
  approved: '已确认',
  uploaded: '已上传',
};

export function KnowledgeHero({
  mode,
  onChangeMode,
  materialCount,
  factCount,
  overviewLoading,
  statusFilter,
  onMaterialStatusFilterChange,
  factStatusFilter,
  onFactStatusFilterChange,
}: {
  mode: KnowledgeMode;
  onChangeMode: (mode: KnowledgeMode) => void;
  materialCount: number;
  factCount: number;
  overviewLoading?: boolean;
  statusFilter: CustomerMaterialStatus | '';
  onMaterialStatusFilterChange: (status: CustomerMaterialStatus | '') => void;
  factStatusFilter: FactStatus | '';
  onFactStatusFilterChange: (status: FactStatus | '') => void;
}) {
  return (
    <section className="module-hero card-section accent-plan material-hero knowledge-hero">
      <div className="module-hero-main">
        <div className="today-hero-heading">
          <span className="topbar-kicker today-hero-kicker">customer knowledge</span>
          <h2>{mode === 'materials' ? '周期材料审核' : '客户事实库'}</h2>
          <p>
            {mode === 'materials'
              ? '每周日 20:00 cron 自动聚合 confirmed facts 为周期材料；审核后由主代理上传 NotebookLM。'
              : '所有客户事实原文保留在这里，随时修正错别字、切换状态或删除误录。'}
          </p>
        </div>
      </div>

      <div className="knowledge-segmented board-segmented board-segmented-compact" role="tablist" aria-label="知识模块分段">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'materials'}
          className={mode === 'materials' ? 'knowledge-segment board-segment board-segment-active' : 'knowledge-segment board-segment'}
          onClick={() => onChangeMode('materials')}
        >
          材料 <strong>{materialCount}</strong>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'facts'}
          className={mode === 'facts' ? 'knowledge-segment board-segment board-segment-active' : 'knowledge-segment board-segment'}
          onClick={() => onChangeMode('facts')}
        >
          事实 <strong>{overviewLoading ? '…' : factCount}</strong>
        </button>
      </div>

      {mode === 'materials' ? (
        <div className="material-filter-row" aria-label="客户材料状态筛选">
          <button type="button" className={statusFilter === '' ? 'material-filter-chip material-filter-chip-active' : 'material-filter-chip'} onClick={() => onMaterialStatusFilterChange('')}>全部</button>
          {(Object.keys(materialStatusLabelMap) as CustomerMaterialStatus[]).map((status) => (
            <button key={status} type="button" className={statusFilter === status ? 'material-filter-chip material-filter-chip-active' : 'material-filter-chip'} onClick={() => onMaterialStatusFilterChange(status)}>
              {materialStatusLabelMap[status]}
            </button>
          ))}
        </div>
      ) : (
        <div className="material-filter-row" aria-label="事实状态筛选">
          <button type="button" className={factStatusFilter === '' ? 'material-filter-chip material-filter-chip-active' : 'material-filter-chip'} onClick={() => onFactStatusFilterChange('')}>全部</button>
          {(Object.keys(factStatusLabelMap) as FactStatus[]).map((status) => (
            <button key={status} type="button" className={factStatusFilter === status ? 'material-filter-chip material-filter-chip-active' : 'material-filter-chip'} onClick={() => onFactStatusFilterChange(status)}>
              {factStatusLabelMap[status]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function MaterialBatchGroupSection({
  batch,
  materials,
  customerMap,
  onOpen,
}: {
  batch: ReviewBatch | null;
  materials: CustomerMaterial[];
  customerMap: Map<number, Customer>;
  onOpen: (material: CustomerMaterial) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const title = batch
    ? batch.title
    : '未归批次（旧数据）';
  const period = batch?.period_start && batch?.period_end
    ? `${(batch.period_start || '').slice(0, 10)} ~ ${(batch.period_end || '').slice(0, 10)}`
    : '';
  return (
    <section className="card-section accent-board material-group-card">
      <div className="section-heading board-group-heading">
        <button type="button" className="section-heading-main collapsible-heading" onClick={() => setCollapsed((prev) => !prev)}>
          <div className="section-heading-copy">
            <strong>{title}</strong>
            <span>
              {period && <>{period} · </>}
              {batch && <>{reviewBatchStatusLabelMap[batch.status] || batch.status} · </>}
              {materials.length} 份材料
            </span>
          </div>
          <span className="collapse-indicator">{collapsed ? '⌄' : '⌃'}</span>
        </button>
      </div>
      {!collapsed && (
        <div className="material-list">
          {materials.map((material) => {
            const customerName = material.customer_id != null
              ? customerMap.get(material.customer_id)?.name
              : null;
            return (
              <MaterialRowWithCustomer
                key={material.id}
                material={material}
                customerName={customerName || null}
                onOpen={() => onOpen(material)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function KnowledgeFactCustomerCard({
  customerOverview,
  pinned,
  canMoveUp,
  canMoveDown,
  expanded,
  expandedProjectKeys,
  projectFacts,
  projectFactsLoading,
  onToggleCollapsed,
  onTogglePinned,
  onMoveUp,
  onMoveDown,
  onToggleProject,
  onLoadProjectFacts,
  onOpenFact,
}: {
  customerOverview: KnowledgeFactCustomerOverview;
  pinned: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  expanded: boolean;
  expandedProjectKeys: string[];
  projectFacts: Record<string, Fact[]>;
  projectFactsLoading: Record<string, boolean>;
  onToggleCollapsed: () => void;
  onTogglePinned: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleProject: (projectKey: string) => void;
  onLoadProjectFacts: (customerId: number | null, projectId: number | null) => void;
  onOpenFact: (fact: Fact) => void;
}) {
  const cid = customerOverview.customer_id;
  const latestDate = customerOverview.latest_fact_at
    ? formatDateTimeShort(customerOverview.latest_fact_at)
    : '';
  return (
    <section className="card-section accent-board material-group-card">
      <div className="section-heading board-group-heading">
        <button type="button" className="section-heading-main collapsible-heading" onClick={onToggleCollapsed}>
          <div className="section-heading-copy">
            <strong>{customerOverview.customer_name}</strong>
            <span>
              {customerOverview.project_count} 个项目 · {customerOverview.fact_count} 条事实
              {latestDate ? <> · {latestDate}</> : null}
            </span>
          </div>
        </button>
        <div className="section-heading-side">
          <span className="group-actions-inline">
            <button
              type="button"
              className="mini-icon-button project-group-action-button project-group-action-button-up"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              aria-label={`上移客户 ${customerOverview.customer_name}`}
            >
              <MoveArrowIcon direction="up" />
            </button>
            <button
              type="button"
              className="mini-icon-button project-group-action-button project-group-action-button-down"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              aria-label={`下移客户 ${customerOverview.customer_name}`}
            >
              <MoveArrowIcon direction="down" />
            </button>
            <button
              type="button"
              className={pinned
                ? 'mini-icon-button mini-icon-button-active project-group-action-button project-group-action-button-pin'
                : 'mini-icon-button project-group-action-button project-group-action-button-pin project-group-action-button-pin-inactive'}
              onClick={onTogglePinned}
              aria-label={pinned ? `取消置顶客户 ${customerOverview.customer_name}` : `置顶客户 ${customerOverview.customer_name}`}
            >
              {pinned ? <PinIcon active /> : <PinIcon active={false} />}
            </button>
          </span>
          <button type="button" className="section-toggle-icon-button" onClick={onToggleCollapsed} aria-label={expanded ? `折叠 ${customerOverview.customer_name}` : `展开 ${customerOverview.customer_name}`}>
            <span className="section-toggle-icon">{expanded ? '−' : '+'}</span>
          </button>
        </div>
      </div>
      {expanded && (
        <div className="material-list">
          {customerOverview.projects.map((proj) => {
            const projKey = `${cid ?? 'none'}:${proj.project_id ?? 'unassigned'}`;
            const factsList = projectFacts[projKey] || [];
            const loading = projectFactsLoading[projKey] || false;
            const projExpanded = expandedProjectKeys.includes(projKey);
            const projLatest = proj.latest_fact_at
              ? formatDateTimeShort(proj.latest_fact_at)
              : '';
            return (
              <div key={projKey} className="knowledge-project-group">
                <button
                  type="button"
                  className="knowledge-project-header"
                  onClick={() => {
                    onToggleProject(projKey);
                    if (!projExpanded && factsList.length === 0) {
                      onLoadProjectFacts(cid, proj.project_id);
                    }
                  }}
                >
                  <div className="knowledge-project-header-copy">
                    <strong>{proj.project_name}</strong>
                    <span>
                      {proj.fact_count} 条事实
                      {projLatest ? <> · {projLatest}</> : null}
                    </span>
                  </div>
                  <span className="collapse-indicator">{projExpanded ? '⌃' : '⌄'}</span>
                </button>
                {projExpanded && (
                  <div className="knowledge-project-facts">
                    {loading ? (
                      <StateCard text="加载事实中…" />
                    ) : factsList.length === 0 ? (
                      <div className="helper-text">这个项目暂无匹配状态的事实</div>
                    ) : (
                      factsList.map((fact) => (
                        <FactRow key={fact.id} fact={fact} onOpen={() => onOpenFact(fact)} />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function FactCustomerGroupSection({
  title,
  facts,
  onOpen,
}: {
  title: string;
  facts: Fact[];
  onOpen: (fact: Fact) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="card-section accent-board material-group-card">
      <div className="section-heading board-group-heading">
        <button type="button" className="section-heading-main collapsible-heading" onClick={() => setCollapsed((prev) => !prev)}>
          <div className="section-heading-copy">
            <strong>{title}</strong>
            <span>本组 {facts.length} 条事实</span>
          </div>
          <span className="collapse-indicator">{collapsed ? '⌄' : '⌃'}</span>
        </button>
      </div>
      {!collapsed && (
        <div className="material-list">
          {facts.map((fact) => (
            <FactRow key={fact.id} fact={fact} onOpen={() => onOpen(fact)} />
          ))}
        </div>
      )}
    </section>
  );
}
