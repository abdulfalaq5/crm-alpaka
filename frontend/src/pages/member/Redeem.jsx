import { useState } from 'react';
import { Alert, Button, Popconfirm, Skeleton, Table, Tabs, Tooltip, App } from 'antd';
import api, { errMsg } from '../../api';
import { useLoad } from '../../hooks';
import { fmtDate, fmtDateTime, num, ALASAN_TERKUNCI } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import RewardDetail from '../../components/RewardDetail';

// Katalog reward + riwayat redeem (RDM-01..08).
export default function Redeem() {
  const { message, modal } = App.useApp();
  const points = useLoad('/member/points');
  const rewards = useLoad('/rewards');
  const [page, setPage] = useState(1);
  const history = useLoad('/member/redeems', { page, limit: 10 }, [page]);
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const tersedia = points.data?.data.tersedia ?? 0;

  // Katalog ikut dimuat ulang: stok reward berkurang setiap kali ada redeem.
  const refresh = () => { points.reload(); rewards.reload(); history.reload(); };

  /** Kembalikan promise agar pemanggil (mis. drawer detail) tahu pengajuannya terkirim. */
  const redeem = (reward) =>
    new Promise((resolve, reject) => {
      modal.confirm({
        title: `Tukar "${reward.nama}"?`,
        content: (
          <p>
            <b>{num(reward.poin_dibutuhkan)} poin</b> akan ditahan (hold) sampai pengajuan diproses admin. Bila ditolak atau
            dibatalkan, poin kembali ke saldo tersedia.
          </p>
        ),
        okText: 'Ajukan Redeem',
        cancelText: 'Batal',
        onOk: async () => {
          try {
            await api.post('/redeem', { reward_id: reward.id });
            message.success('Pengajuan redeem dikirim. Status: Menunggu Persetujuan.');
            refresh();
            resolve();
          } catch (err) {
            message.error(errMsg(err));
            refresh();
            reject(err);
          }
        },
        onCancel: () => reject(new Error('dibatalkan')),
      });
    });


  const cancel = async (id) => {
    setBusy(true);
    try {
      await api.post(`/redeem/${id}/cancel`);
      message.success('Pengajuan dibatalkan. Poin dikembalikan.');
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <>
      <h1 className="page-title">Redeem Poin</h1>
      <p className="page-sub">Poin tersedia Anda: <b>{num(tersedia)}</b></p>
      <Tabs
        items={[
          {
            key: 'reward',
            label: 'Reward',
            children: (
              <>
                {rewards.error && <Alert type="error" showIcon message={rewards.error} />}
                {rewards.loading && <Skeleton active paragraph={{ rows: 6 }} />}
                {rewards.data?.data.length === 0 && !rewards.loading && (
                  <EmptyState text="Belum ada reward yang tersedia" />
                )}
                <div className="reward-grid">
                  {(rewards.data?.data || []).map((r) => {
                    const kurang = r.poin_dibutuhkan - tersedia;
                    const terkunci = kurang > 0 || r.memenuhi_tier === false;
                    const label = kurang > 0 ? 'Poin belum cukup' : r.bisa_ditukar ? 'Tukar' : ALASAN_TERKUNCI[r.alasan_kode] || 'Tidak tersedia';
                    return (
                      <div className="reward-card" key={r.id}>
                        <button type="button" className="reward-visual" onClick={() => setDetailId(r.id)} aria-label={`Detail ${r.nama}`}>
                          {r.gambar_url ? <img src={r.gambar_url} alt={r.nama} loading="lazy" /> : r.nama.slice(0, 1).toUpperCase()}
                        </button>
                        <div className="reward-body">
                          <h3>
                            <button type="button" className="linklike" onClick={() => setDetailId(r.id)}>{r.nama}</button>
                          </h3>
                          {r.deskripsi && <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{r.deskripsi}</div>}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            {r.tier_minimum_nama && <span>Khusus tier {r.tier_minimum_nama}+</span>}
                            {r.status_stok === 'tersedia' && <span>· Sisa stok {num(r.stok)}{r.stok <= 3 ? ' (menipis)' : ''}</span>}
                            {r.valid_until && <span>· Berlaku s/d {fmtDate(r.valid_until)}</span>}
                          </div>
                          <div style={{ fontWeight: 600, marginTop: 'auto' }}>{num(r.poin_dibutuhkan)} poin</div>
                          <Tooltip title={kurang > 0 ? `Poin Anda kurang ${num(kurang)} lagi` : r.alasan_terkunci || ''}>
                            <span>
                              <Button type="primary" block disabled={terkunci} onClick={() => redeem(r)}>
                                {label}
                              </Button>
                            </span>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ),
          },
          {
            key: 'riwayat',
            label: 'Riwayat Redeem',
            children: (
              <Table
                rowKey="id"
                loading={history.loading}
                dataSource={history.data?.data || []}
                locale={{ emptyText: <EmptyState text="Belum ada redeem" /> }}
                pagination={{ current: page, pageSize: 10, total: history.data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
                columns={[
                  { title: 'Tanggal', dataIndex: 'created_at', render: fmtDateTime, responsive: ['md'] },
                  {
                    title: 'Reward',
                    render: (_, r) => (
                      <>
                        {r.reward_nama}
                        {r.status === 'selesai' && <div className="cell-sub">{r.detail_pemberian || 'Reward diberikan.'}</div>}
                        {r.status === 'ditolak' && <div className="cell-sub">Alasan: {r.alasan_penolakan}</div>}
                      </>
                    ),
                  },
                  { title: 'Poin', dataIndex: 'jumlah_poin', render: num, align: 'right', responsive: ['sm'] },
                  { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s} /> },
                  {
                    title: '',
                    render: (_, r) =>
                      r.status === 'menunggu_persetujuan' && (
                        <Popconfirm title="Batalkan pengajuan ini?" okText="Ya, batalkan" cancelText="Tidak" onConfirm={() => cancel(r.id)}>
                          <Button size="small" loading={busy}>Batalkan</Button>
                        </Popconfirm>
                      ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
      {detailId && (
        <RewardDetail rewardId={detailId} tersedia={tersedia} onClose={() => setDetailId(null)} onRedeem={redeem} />
      )}
    </>
  );
}
