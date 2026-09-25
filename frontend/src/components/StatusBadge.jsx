import { STATUS } from '../format';

const COLORS = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-text-secondary)',
};

// Badge teks kecil berwarna sesuai token (bukan ikon besar mencolok).
// `map` untuk domain lain (mis. VOUCHER_STATUS); tanpa itu memakai peta STATUS Receipt/Redeem/Account.
export default function StatusBadge({ status, label, map = STATUS }) {
  const s = map[status] || { label: status, color: 'neutral' };
  const color = COLORS[s.color];
  return (
    <span
      className="status-badge"
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        border: `1px solid ${color}`,
        color,
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label || s.label}
    </span>
  );
}
