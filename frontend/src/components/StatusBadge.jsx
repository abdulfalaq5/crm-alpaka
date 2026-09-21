import { STATUS } from '../format';

const COLORS = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-text-secondary)',
};

// Badge teks kecil berwarna sesuai token (bukan ikon besar mencolok).
export default function StatusBadge({ status, label }) {
  const s = STATUS[status] || { label: status, color: 'neutral' };
  const color = COLORS[s.color];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        border: `1px solid ${color}`,
        color,
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {label || s.label}
    </span>
  );
}
