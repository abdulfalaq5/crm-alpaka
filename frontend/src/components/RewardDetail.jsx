import { useState } from 'react';
import { Alert, App, Button, Descriptions, Drawer, Skeleton, Tag } from 'antd';
import { useLoad } from '../hooks';
import { fmtDate, num, sisaHari, STATUS_STOK } from '../format';

/**
 * Detail reward untuk member (tambahan.md poin 2): syarat tier, masa tampil, dan masa berlaku
 * voucher setelah redeem disetujui. `onRedeem` mengembalikan promise agar drawer bisa nutup
 * hanya bila pengajuan benar-benar terkirim.
 */
export default function RewardDetail({ rewardId, tersedia, onClose, onRedeem }) {
  const { message } = App.useApp();
  const { data, loading, error } = useLoad(`/rewards/${rewardId}`, undefined, [rewardId]);
  const [busy, setBusy] = useState(false);
  const r = data?.data;

  const kurang = r ? r.poin_dibutuhkan - tersedia : 0;
  // `bisa_ditukar` = sisi reward (stok/tier/masa tampil); kekurangan poin dihitung dari saldo member.
  const terkunci = !r || !r.bisa_ditukar || kurang > 0;
  const alasan = kurang > 0 ? `Poin Anda kurang ${num(kurang)} lagi.` : r?.alasan_terkunci;

  const ajukan = async () => {
    setBusy(true);
    try {
      await onRedeem(r);
      onClose();
    } catch {
      message.warning('Pengajuan tidak terkirim.');
    } finally {
      setBusy(false);
    }
  };

  const stok = r && (
    <div>
      {r.status_stok === 'tanpa_batas' ? STATUS_STOK.tanpa_batas.label : `Sisa stok ${num(r.stok)}`}
      {r.status_stok === 'tersedia' && r.stok <= 3 && <div className="cell-sub">Stok menipis</div>}
    </div>
  );

  const masaTampil = r?.valid_from || r?.valid_until
    ? `${r.valid_from ? fmtDate(r.valid_from) : 'sekarang'} s/d ${r.valid_until ? fmtDate(r.valid_until) : 'tanpa batas'}`
    : 'Selalu tampil';

  return (
    <Drawer title={r ? r.nama : 'Detail Reward'} width={480} open onClose={onClose} loading={loading}>
      {error && <Alert type="error" showIcon message={error} />}
      {loading && !r && <Skeleton active />}
      {r && (
        <>
          <div className="reward-detail-visual">
            {r.gambar_url ? <img src={r.gambar_url} alt={r.nama} /> : r.nama.slice(0, 1).toUpperCase()}
          </div>
          {r.deskripsi && <p style={{ color: 'var(--color-text-secondary)' }}>{r.deskripsi}</p>}
          <Descriptions
            column={1}
            size="small"
            bordered
            items={[
              { key: 'poin', label: 'Poin dibutuhkan', children: <b>{num(r.poin_dibutuhkan)} poin</b> },
              {
                key: 'tier',
                label: 'Syarat tier',
                children: r.tier_minimum_nama ? (
                  <>
                    Tier {r.tier_minimum_nama} ke atas
                    {!r.memenuhi_tier && <div className="cell-sub">Tier Anda belum memenuhi syarat ini.</div>}
                  </>
                ) : (
                  'Semua tier'
                ),
              },
              { key: 'stok', label: 'Ketersediaan', children: stok },
              { key: 'masa', label: 'Masa tampil', children: masaTampil },
              { key: 'berlaku', label: 'Berlaku setelah redeem', children: `${num(r.berlaku_hari)} hari` },
              { key: 'status', label: 'Status', children: <Tag color={STATUS_STOK[r.status_stok]?.color}>{STATUS_STOK[r.status_stok]?.label}</Tag> },
              r.valid_until && r.bisa_ditukar
                ? { key: 'sisa', label: 'Berakhir dalam', children: `${num(sisaHari(r.valid_until))} hari lagi` }
                : null,
            ].filter(Boolean)}
          />
          {terkunci && alasan && <Alert type="warning" showIcon message={alasan} style={{ marginTop: 12 }} />}
          <div className="actions" style={{ marginTop: 16 }}>
            <Button type="primary" disabled={terkunci} loading={busy} onClick={ajukan}>
              Ajukan Redeem
            </Button>
            <Button onClick={onClose}>Tutup</Button>
          </div>
          <p className="cell-sub" style={{ marginTop: 8 }}>
            Poin ditahan sampai pengajuan diproses admin. Bila ditolak atau dibatalkan, poin kembali ke saldo tersedia.
          </p>
        </>
      )}
    </Drawer>
  );
}
