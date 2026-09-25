import { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Input, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import { CopyOutlined, SearchOutlined } from '@ant-design/icons';
import api, { errMsg } from '../../api';
import { useLoad } from '../../hooks';
import { fmtDateTime, num, sisaHari, VOUCHER_SUMBER, VOUCHER_STATUS } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';

// Status tampilan mengikuti status_efektif dari backend (sudah disesuaikan waktu sekarang).
const statusOf = (v) => v.status_efektif || v.status;
const badge = (v) => <StatusBadge status={statusOf(v)} map={VOUCHER_STATUS} />;

function SisaBerlaku({ voucher }) {
  const hari = sisaHari(voucher.expires_at);
  if (statusOf(voucher) !== 'active') return null;
  const warna = hari <= 3 ? 'var(--color-danger)' : hari <= 7 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
  return <span style={{ color: warna }}>{hari === 0 ? 'Berakhir hari ini' : `${num(hari)} hari lagi`}</span>;
}

function KartuVoucher({ voucher, onCopy }) {
  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Space size={8} align="center">
            <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{voucher.kode}</code>
            {voucher.sumber === 'manual' && <Tag>Manual</Tag>}
          </Space>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{voucher.reward_nama}</div>
        </div>
        <Space direction="vertical" align="end" size={4}>
          {badge(voucher)}
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Berlaku sampai {fmtDateTime(voucher.expires_at)}
          </span>
          <SisaBerlaku voucher={voucher} />
        </Space>
      </div>
      {statusOf(voucher) === 'active' && (
        <div style={{ marginTop: 10 }}>
          <Button size="small" icon={<CopyOutlined />} onClick={() => onCopy(voucher.kode)}>Salin kode</Button>
          <div className="cell-sub" style={{ marginTop: 6 }}>
            Tunjukkan kode ini saat checkout di Alpaka. Kode hanya berlaku satu kali.
          </div>
        </div>
      )}
      {voucher.catatan && <div className="cell-sub" style={{ marginTop: 8 }}>Catatan: {voucher.catatan}</div>}
      {statusOf(voucher) === 'reserved' && (
        <div className="cell-sub" style={{ marginTop: 8 }}>Sedang dipakai di checkout — tunggu konfirmasi transaksi.</div>
      )}
      {statusOf(voucher) === 'used' && <div className="cell-sub" style={{ marginTop: 8 }}>Terpakai {fmtDateTime(voucher.used_at)}.</div>}
      {statusOf(voucher) === 'void' && <div className="cell-sub" style={{ marginTop: 8 }}>Dibatalkan admin. Alasan: {voucher.void_reason}</div>}
    </Card>
  );
}

// Halaman member: daftar voucher aktif & riwayat (tambahan.md poin 3). Read-only — redemption
// terjadi saat checkout di More by Morello, bukan dari halaman ini.
export default function Vouchers() {
  const { message } = App.useApp();
  const [tab, setTab] = useState('aktif');
  const [page, setPage] = useState(1);
  const [kode, setKode] = useState('');
  const [cekBusy, setCekBusy] = useState(false);
  const [cekError, setCekError] = useState(null);
  const [hasilCek, setHasilCek] = useState(null);

  // Tab Aktif memuat voucher yang masih bisa dipakai (termasuk yang sedang di-reserve checkout More).
  const aktif = useLoad('/member/vouchers', { page, limit: 10, status: 'active,reserved' }, [page, tab]);
  const riwayat = useLoad('/member/vouchers', { page, limit: 10, status: 'used,expired,void' }, [page, tab]);
  const r = aktif.data?.meta.ringkasan;
  const jmlAktif = r ? r.aktif + r.dipesan : 0;

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      message.success('Kode voucher disalin.');
    } catch {
      message.info(`Kode voucher: ${value}`);
    }
  };

  const cekKode = async () => {
    const value = kode.trim();
    if (!value) return;
    setCekBusy(true);
    setCekError(null);
    setHasilCek(null);
    try {
      const { data } = await api.get('/member/vouchers/cek', { params: { kode: value } });
      setHasilCek(data.data);
      aktif.reload();
      riwayat.reload();
    } catch (err) {
      setCekError(errMsg(err));
    } finally {
      setCekBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Voucher Saya</h1>
      <p className="page-sub">
        Kode voucher dari redeem yang disetujui. Tunjukkan kode saat checkout — berlaku sekali per kode.
        {r ? ` Anda punya ${num(jmlAktif)} voucher aktif.` : ''}
      </p>
      {r && r.akan_kedaluwarsa > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${num(r.akan_kedaluwarsa)} voucher Anda akan segera kedaluwarsa (7 hari ke depan).`}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Input
          value={kode}
          onChange={(e) => setKode(e.target.value.toUpperCase())}
          onPressEnter={cekKode}
          placeholder="Masukkan kode voucher untuk dicek"
          prefix={<SearchOutlined />}
          suffix={
            <Button type="link" size="small" loading={cekBusy} disabled={!kode.trim()} onClick={cekKode}>
              Cek kode
            </Button>
          }
          style={{ textTransform: 'uppercase' }}
        />
        {cekError && <Alert type="error" showIcon message={cekError} style={{ marginTop: 12 }} />}
        {hasilCek && (
          <div style={{ marginTop: 12 }}>
            <Descriptions size="small" column={1} bordered items={[
              { key: 'kode', label: 'Kode', children: <code>{hasilCek.kode}</code> },
              { key: 'reward', label: 'Reward', children: hasilCek.reward_nama },
              { key: 'status', label: 'Status', children: badge(hasilCek) },
              { key: 'sumber', label: 'Sumber', children: VOUCHER_SUMBER[hasilCek.sumber] || hasilCek.sumber },
              { key: 'expired', label: 'Berlaku sampai', children: <>{fmtDateTime(hasilCek.expires_at)} <SisaBerlaku voucher={hasilCek} /></> },
              { key: 'catatan', label: 'Catatan', children: hasilCek.catatan || '-' },
            ]} />
          </div>
        )}
      </Card>
      <Tabs
        activeKey={tab}
        onChange={(key) => {
          setTab(key);
          setPage(1);
          setHasilCek(null);
          setCekError(null);
        }}
        items={[
          {
            key: 'aktif',
            label: `Aktif${r ? ` (${num(jmlAktif)})` : ''}`,
            children: (
              <div>
                {aktif.error && <Alert type="error" showIcon message={aktif.error} style={{ marginBottom: 16 }} />}
                {aktif.loading && !aktif.data ? <EmptyState text="Memuat voucher..." /> : null}
                {!aktif.loading && (aktif.data?.data || []).length === 0 && (
                  <EmptyState text="Belum ada voucher aktif">
                    Tukar poin Anda di halaman Redeem untuk mendapat kode voucher.
                  </EmptyState>
                )}
                {(aktif.data?.data || []).map((v) => (
                  <KartuVoucher key={v.id} voucher={v} onCopy={copy} />
                ))}
                <div className="actions" style={{ marginTop: 8 }}>
                  <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
                  <Button disabled={!aktif.data?.meta || page * 10 >= aktif.data.meta.total} onClick={() => setPage((p) => p + 1)}>
                    Berikutnya
                  </Button>
                </div>
              </div>
            ),
          },
          {
            key: 'riwayat',
            label: `Riwayat${r ? ` (${num(r.terpakai + r.kedaluwarsa + r.dibatalkan)})` : ''}`,
            children: (
              <>
                {riwayat.error && <Alert type="error" showIcon message={riwayat.error} style={{ marginBottom: 16 }} />}
                <Table
                  rowKey="id"
                  size="small"
                  loading={riwayat.loading}
                  dataSource={riwayat.data?.data || []}
                  locale={{ emptyText: <EmptyState text="Belum ada riwayat voucher" /> }}
                  pagination={{
                    current: page,
                    pageSize: 10,
                    total: riwayat.data?.meta.total || 0,
                    onChange: setPage,
                    showSizeChanger: false,
                  }}
                  columns={[
                    { title: 'Kode', dataIndex: 'kode', render: (k, row) => <code>{k}</code> },
                    { title: 'Reward', dataIndex: 'reward_nama', responsive: ['sm'] },
                    { title: 'Diterbitkan', dataIndex: 'issued_at', render: fmtDateTime, responsive: ['md'] },
                    { title: 'Berlaku sampai', dataIndex: 'expires_at', render: fmtDateTime, responsive: ['lg'] },
                    { title: 'Status', dataIndex: 'status', render: (_, row) => badge(row) },
                    {
                      title: '',
                      render: (_, row) =>
                        statusOf(row) === 'active' ? (
                          <Tooltip title="Salin kode voucher">
                            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(row.kode)} />
                          </Tooltip>
                        ) : null,
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
