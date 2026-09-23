import { Progress } from 'antd';
import { num } from '../format';

// Widget tier & progress (tambahan.md poin 1): tier saat ini + jarak ke tier berikutnya.
export default function TierProgress({ data }) {
  if (!data) return null;
  const { tier_saat_ini, tier_berikutnya, poin_saat_ini, poin_dibutuhkan, persen } = data;
  return (
    <div className="card">
      <p className="section-label">Tier Member</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{tier_saat_ini?.nama || 'Belum ada tier'}</span>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{num(poin_saat_ini)} poin lifetime</span>
      </div>
      {tier_saat_ini?.benefit && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>{tier_saat_ini.benefit}</div>}
      {tier_berikutnya ? (
        <>
          <Progress percent={persen} showInfo={false} strokeColor="#171717" trailColor="#e4e1dc" />
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {num(poin_dibutuhkan)} poin lagi menuju <b>{tier_berikutnya.nama}</b>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--color-success)' }}>Anda sudah berada di tier tertinggi.</div>
      )}
    </div>
  );
}
