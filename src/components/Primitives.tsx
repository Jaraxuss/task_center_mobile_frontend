export function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <div className="detail-label">{label}</div>
      <div>{value}</div>
    </div>
  );
}

export function StateCard({ text, tone = 'default' }: { text: string; tone?: 'default' | 'danger' }) {
  return <div className={tone === 'danger' ? 'state-card state-danger' : 'state-card'}>{text}</div>;
}

export function EmptyHint({ label }: { label: string }) {
  return <div className="empty-hint">{label}</div>;
}
