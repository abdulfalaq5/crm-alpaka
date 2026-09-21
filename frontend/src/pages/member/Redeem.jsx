import { useState } from 'react';
import { Alert, Button, Modal, Popconfirm, Table, Tabs, Tooltip, message } from 'antd';
import api, { errMsg } from '../../api';
import { useLoad } from '../../hooks';
import { fmtDateTime, num } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

// Katalog reward + riwayat redeem (RDM-01..08).
export default function Redeem() {
  const points = useLoad('/member/points');
  const rewards = useLoad('/rewards');
  const [page, setPage] = useState(1);
  const history = useLoad('/member/redeems', { page, limit: 10 }, [page]);
  const [busy, setBusy] = useState(false);
  const tersedia = points.data?.data.tersedia ?? 0;

  const refresh = () => { points.reload(); history.reload(); };

  const redeem = (reward) => {
    Modal.confirm({
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
        } catch (err) {
          message.error(errMsg(err));
          refresh();
        }
      },
    });
  };

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
                {rewards.data?.data.length === 0 && <EmptyState text="Belum ada reward yang tersedia" />}
                <div className="reward-grid">
                  {(rewards.data?.data || []).map((r) => {
                    const kurang = r.poin_dibutuhkan - tersedia;
                    return (
                      <div className="reward-card" key={r.id}>
                        <div className="reward-visual">{r.nama.slice(0, 1).toUpperCase()}</div>
                        <div className="reward-body">
                          <h3>{r.nama}</h3>
                          {r.deskripsi && <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{r.deskripsi}</div>}
                          <div style={{ fontWeight: 600, marginTop: 'auto' }}>{num(r.poin_dibutuhkan)} poin</div>
                          <Tooltip title={kurang > 0 ? `Poin Anda kurang ${num(kurang)} lagi` : ''}>
                            <span>
                              <Button type="primary" block disabled={kurang > 0} onClick={() => redeem(r)}>
                                {kurang > 0 ? 'Poin belum cukup' : 'Tukar'}
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
                scroll={{ x: 640 }}
                locale={{ emptyText: <EmptyState text="Belum ada redeem" /> }}
                pagination={{ current: page, pageSize: 10, total: history.data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
                columns={[
                  { title: 'Tanggal', dataIndex: 'created_at', render: fmtDateTime },
                  { title: 'Reward', dataIndex: 'reward_nama' },
                  { title: 'Poin', dataIndex: 'jumlah_poin', render: num, align: 'right' },
                  { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s} /> },
                  {
                    title: 'Keterangan',
                    render: (_, r) =>
                      r.status === 'selesai' ? (r.detail_pemberian || 'Reward diberikan.') : r.status === 'ditolak' ? `Alasan: ${r.alasan_penolakan}` : '',
                  },
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
    </>
  );
}
