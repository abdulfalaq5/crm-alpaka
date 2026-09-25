import { Alert, Progress, Skeleton, Tag } from 'antd';
import { num } from '../format';

export default function TierProgress({ data, loading, error }) {
  if (error) {
    return (
      <div className="card">
        <p className="section-label">Tier Member</p>
        <Alert type="error" showIcon message="Progress tier tidak dapat dimuat." description={error} />
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className="card">
        <p className="section-label">Tier Member</p>
        <Skeleton active paragraph={{ rows: 2 }} />
      </div>
    );
  }
  if (!data) return null;

  const { tier_saat_ini, tier_berikutnya, poin_saat_ini, poin_dibutuhkan, persen, semua_tier, tier_manual } = data;
  const tierBelumAda = !semua_tier?.length;
  return (
    <div className="card">
      <p className="section-label">Tier Member</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{tier_saat_ini?.nama || 'Belum ada tier'}</span>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{num(poin_saat_ini)} poin lifetime</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {tier_manual && <Tag color="gold">Tier manual</Tag>}
        {tier_saat_ini?.benefit && <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{tier_saat_ini.benefit}</span>}
      </div>
      {tier_manual && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '8px 0 12px' }}>
          Tier ini diberikan oleh admin dan tetap aktif sampai dikembalikan ke mode otomatis.
        </div>
      )}
      {tierBelumAda ? (
        <Alert type="info" showIcon message="Belum ada tier yang dikonfigurasi." style={{ marginTop: 12 }} />
      ) : tier_berikutnya ? (
        <div style={{ marginTop: 12 }}>
          <Progress percent={persen} showInfo={false} strokeColor="#171717" trailColor="#e4e1dc" />
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {num(poin_dibutuhkan)} poin lagi menuju <b>{tier_berikutnya.nama}</b>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--color-success)', marginTop: 12 }}>Anda sudah berada di tier tertinggi.</div>
      )}
    </div>
  );
}
