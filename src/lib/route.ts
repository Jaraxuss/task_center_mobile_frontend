export type TabKey = 'today' | 'plan' | 'board' | 'knowledge' | 'history';
export type BoardMode = 'status' | 'project';
export type KnowledgeMode = 'materials' | 'facts';

const tabKeys: TabKey[] = ['today', 'plan', 'board', 'knowledge', 'history'];

export function parseRouteState() {
  if (typeof window === 'undefined') {
    return {
      tab: 'today' as TabKey,
      boardMode: 'status' as BoardMode,
      knowledgeMode: 'materials' as KnowledgeMode,
      historyDraft: { q: '', status: '', date: '' },
    };
  }

  const raw = window.location.hash.replace(/^#/, '') || '/today';
  const [pathPart, searchPart = ''] = raw.split('?');
  // Back-compat: old `#/materials` -> knowledge tab, materials sub-mode
  let rawTab: string = tabKeys.some((item) => `/${item}` === pathPart) ? pathPart.slice(1) : 'today';
  if (pathPart === '/materials') rawTab = 'knowledge';
  const tab = rawTab as TabKey;
  const params = new URLSearchParams(searchPart);
  const knowledgeModeRaw = params.get('mode');
  const knowledgeMode: KnowledgeMode = knowledgeModeRaw === 'facts' ? 'facts' : 'materials';
  return {
    tab,
    boardMode: params.get('mode') === 'project' ? ('project' as BoardMode) : ('status' as BoardMode),
    knowledgeMode,
    historyDraft: {
      q: params.get('q') || '',
      status: params.get('status') || '',
      date: params.get('date') || '',
    },
  };
}

export function buildHash(
  tab: TabKey,
  boardMode: BoardMode,
  knowledgeMode: KnowledgeMode,
  historyFilters: { q: string; status: string; date: string },
) {
  const params = new URLSearchParams();
  if (tab === 'board' && boardMode !== 'status') params.set('mode', boardMode);
  if (tab === 'knowledge' && knowledgeMode !== 'materials') params.set('mode', knowledgeMode);
  if (tab === 'history') {
    if (historyFilters.q) params.set('q', historyFilters.q);
    if (historyFilters.status) params.set('status', historyFilters.status);
    if (historyFilters.date) params.set('date', historyFilters.date);
  }
  const query = params.toString();
  return `#/${tab}${query ? `?${query}` : ''}`;
}
