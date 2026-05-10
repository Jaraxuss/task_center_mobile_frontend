import { getTaskScheduleAt } from '../lib';
import type { TaskActionType } from '../lib';
import { CompactFactRow, DetailItem, MaterialRow, StatusPill } from '../components';
import { Customer, CustomerMaterial, Fact, Task } from '../types';
import { describeRecurrence, describeRecurrenceMeta, formatDateTime, statusLabelMap } from '../utils';

function getLatestFollowupResult(task: Task) {
  if (task.completion_note?.trim()) return task.completion_note.trim();
  const events = task.events || [];
  for (const event of events) {
    const note = typeof event.payload?.note === 'string' ? event.payload.note.trim() : '';
    if (!note) continue;
    if (event.event_type === 'completed' || event.event_type === 'recurrence_advanced') return note;
  }
  return '';
}

export function TaskDetailSheet({
  task,
  loading,
  materials,
  materialsLoading,
  facts,
  factsLoading,
  customerMap,
  busyAction,
  onClose,
  onAction,
  onEdit,
  onEditMaterial,
  onOpenFact,
}: {
  task: Task;
  loading: boolean;
  materials: CustomerMaterial[];
  materialsLoading: boolean;
  facts: Fact[];
  factsLoading: boolean;
  customerMap: Map<number, Customer>;
  busyAction: string | null;
  onClose: () => void;
  onAction: (type: TaskActionType) => void;
  onEdit: () => void;
  onEditMaterial: (material: CustomerMaterial) => void;
  onOpenFact: (factId: number) => void;
}) {
  const latestFollowupResult = getLatestFollowupResult(task);

  return (
    <div className="overlay">
      <div className="sheet detail-sheet">
        <div className="sheet-header">
          <button type="button" className="ghost-button" onClick={onClose}>
            返回
          </button>
          <strong>任务详情</strong>
          <span className="muted-text">#{task.id}</span>
        </div>

        <div className="detail-body">
          <div className={loading ? 'detail-card detail-card-loading' : 'detail-card'}>
            <h2>{task.title}</h2>
            {latestFollowupResult && (
              <div className="detail-text">
                <div className="detail-label">{task.status === 'done' ? '本次跟进结果' : '最近一次跟进结果'}</div>
                <p>{latestFollowupResult}</p>
              </div>
            )}
            <div className="detail-grid">
              <DetailItem label="状态" value={statusLabelMap[task.status]} />
              <DetailItem label="安排时间" value={formatDateTime(getTaskScheduleAt(task))} />
              <DetailItem label="项目" value={task.project || '未分项目'} />
              {task.source_type && <DetailItem label="来源" value={String(task.source_type)} />}
              <DetailItem label="最近更新" value={formatDateTime(task.updated_at)} />
              <DetailItem label="周期" value={task.recurrence?.enabled ? describeRecurrence(task.recurrence) : '单次提醒'} />
              {task.recurrence?.enabled && task.recurrence?.next_run_at && <DetailItem label="下次执行" value={formatDateTime(task.recurrence.next_run_at)} />}
            </div>
            {task.recurrence?.enabled && <div className="helper-text recurrence-helper">{describeRecurrenceMeta(task.recurrence)}</div>}
            <div className="detail-text">
              <div className="detail-label">描述</div>
              <p>{task.description || '暂无描述'}</p>
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-label">客户材料</div>
            {materialsLoading ? (
              <div className="helper-text">客户材料加载中…</div>
            ) : materials.length === 0 ? (
              <div className="helper-text">暂无关联客户材料。客户事实会在周日 20:00 自动聚合成周期材料。</div>
            ) : (
              <div className="material-list compact-material-list">
                {materials.map((material) => (
                  <MaterialRow
                    key={material.id}
                    material={material}
                    compact
                    onOpen={() => onEditMaterial(material)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="detail-card">
            <div className="detail-label">客户事实</div>
            {factsLoading ? (
              <div className="helper-text">客户事实加载中…</div>
            ) : facts.length === 0 ? (
              <div className="helper-text">暂无关联客户事实。客户事实由主代理在转发 / 截图 / 会议纪要场景写入。</div>
            ) : (
              <div className="material-list compact-material-list task-fact-list">
                {facts.map((fact) => (
                  <CompactFactRow
                    key={fact.id}
                    fact={fact}
                    customerName={fact.customer_id != null ? customerMap.get(fact.customer_id)?.name ?? null : null}
                    onOpen={() => onOpenFact(fact.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="detail-card">
            <div className="detail-label">动作</div>
            <div className="action-grid action-grid-wide">
              <button type="button" className="action-button action-primary" onClick={() => onAction('complete')} disabled={busyAction !== null}>
                {busyAction === 'complete' ? '处理中…' : '完成'}
              </button>
              <button type="button" className="action-button" onClick={onEdit} disabled={busyAction !== null}>
                编辑
              </button>
              <button type="button" className="action-button" onClick={() => onAction('reschedule')} disabled={busyAction !== null}>
                {busyAction === 'reschedule' ? '处理中…' : '改时间'}
              </button>
              <button type="button" className="action-button" onClick={() => onAction('defer')} disabled={busyAction !== null}>
                {busyAction === 'defer' ? '处理中…' : '延期'}
              </button>
              <button type="button" className="action-button action-danger action-button-span" onClick={() => onAction('cancel')} disabled={busyAction !== null}>
                {busyAction === 'cancel' ? '处理中…' : '取消'}
              </button>
            </div>
            <div className="helper-text">改时间 / 延期 / 取消都换成了移动端 sheet 交互，不再弹 prompt 了。</div>
          </div>
        </div>
      </div>
    </div>
  );
}
