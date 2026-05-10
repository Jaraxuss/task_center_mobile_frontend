export function MoveArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  // Lucide-style chevron-up / chevron-down
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      {direction === 'up' ? (
        <polyline points="6 15 12 9 18 15" />
      ) : (
        <polyline points="6 9 12 15 18 9" />
      )}
    </svg>
  );
}

export function PinIcon({ active }: { active: boolean }) {
  // Lucide-style pin: tilted needle with rounded head
  return (
    <svg
      className={active ? 'icon-svg icon-svg-pin-active' : 'icon-svg'}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.76a3 3 0 0 0 1.13 2.34L18 15H6l1.87-1.9A3 3 0 0 0 9 10.76Z" />
    </svg>
  );
}

export function ExpandToggleIcon({ expanded }: { expanded: boolean }) {
  // Lucide-style: minimize-2 when expanded, maximize-2 when collapsed
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18 }}>
      {expanded ? (
        <>
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </>
      ) : (
        <>
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </>
      )}
    </svg>
  );
}
