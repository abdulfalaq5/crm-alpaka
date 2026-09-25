import { useState } from 'react';
import { Alert, App, Button, Col, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import api, { errMsg, fieldErrors } from '../../api';
import { useAdminRole } from '../../auth';
import { useLoad } from '../../hooks';
import { fmtDateTime, num, sisaHari, VOUCHER_SUMBER, VOUCHER_STATUS } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import ReasonModal from '../../components/ReasonModal';

const badge = (s) => <StatusBadge status={s} map={VOUCHER_STATUS} />;

// Status yang ditampilkan: status_efektif sudah menyesuaikan dengan waktu sekarang (backend).
const statusOf = (v) => v.status_efektif || v.status;

const Stat = ({ label, value, hint }) => (
  <div className="card" style={{ textAlign: 'center' }}>
    <div className="section-label" style={{ marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    {hint && <div className="cell-sub">{hint}</div>}
  </div>
);

function GenerateModal({ open, onClose, onDone, rewards }) {
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [memberSearch, setMemberSearch] = useState('');
  const [members, setMembers] = useState([]);
  const [searching, setSearching] = useState(false);
  const reward = Form.useWatch('reward_id', form);
  const jumlah = Form.useWatch('jumlah', form) || 1;
  const dipilih = rewards?.data?.find((r) => String(r.id) === String(reward));

  const cariMember = async (q) => {
    if (!q || q.length < 2) return setMembers([]);
    setSearching(true);
    try {
      const { data } = await api.get('/admin/members', { params: { q, limit: 10 } });
      setMembers(data.data.map((m) => ({ value: String(m.id), label: `${m.nama}${m.email ? ` · ${m.email}` : ''}` })));
    } catch {
      setMembers([]);
    } finally {
      setSearching(false);
    }
  };

  const submit = async (values) => {
    setSaving(true);
    try {
      const { data } = await api.post('/admin/vouchers', {
        member_id: Number(values.member_id),
        reward_id: Number(values.reward_id),
        jumlah: values.jumlah || 1,
        berlaku_hari: values.berlaku_hari || undefined,
        catatan: values.catatan,
      });
      form.resetFields();
      setMembers([]);
      onDone(data.data);
    } catch (err) {
      if (err.response?.status === 422) form.setFields(fieldErrors(err));
      else Modal.error({ title: 'Gagal membuat voucher', content: errMsg(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Generate Voucher"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      okText="Buat voucher"
      cancelText="Batal"
      destroyOnHidden
      forceRender
    >
      <Alert
        type="info"
        showIcon
        message="Poin member langsung dipotong dan tercatat sebagai redeem disetujui. Member menerima notifikasi berisi kode voucher."
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} initialValues={{ jumlah: 1 }}>
        <Form.Item
          name="member_id"
          label="Member"
          rules={[{ required: true, message: 'Pilih member' }]}
          extra="Ketik minimal 2 huruf untuk mencari nama/email/no. HP."
        >
          <Select
            showSearch
            filterOption={false}
            onSearch={cariMember}
            loading={searching}
            placeholder="Cari member"
            options={members}
            notFoundContent={memberSearch.length >= 2 ? 'Member tidak ditemukan' : 'Ketik untuk mencari'}
          />
        </Form.Item>
        <Form.Item name="reward_id" label="Reward" rules={[{ required: true, message: 'Pilih reward' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Pilih reward"
            options={(rewards?.data || []).map((r) => ({
              value: String(r.id),
              label: `${r.nama} · ${num(r.poin_dibutuhkan)} poin${r.stok !== null ? ` · stok ${r.stok}` : ''}`,
            }))}
          />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={12}>
            <Form.Item name="jumlah" label="Jumlah voucher" extra={`Maksimal 25.${dipilih ? ` Total ${num(dipilih.poin_dibutuhkan * jumlah)} poin.` : ''}`}>
              <InputNumber style={{ width: '100%' }} min={1} max={25} />
            </Form.Item>
          </Col>
          <Col xs={12}>
            <Form.Item name="berlaku_hari" label="Berlaku (hari)" extra={dipilih ? `Kosongkan untuk ${dipilih.berlaku_hari} hari.` : 'Kosongkan untuk mengikuti reward.'}>
              <InputNumber style={{ width: '100%' }} min={1} max={3650} placeholder={String(dipilih?.berlaku_hari ?? 30)} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="catatan" label="Catatan (opsional)" extra="Tersimpan di voucher dan riwayat member.">
          <Input.TextArea rows={2} maxLength={500} placeholder="mis. Kompensasi keterlambatan proses struk" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function DetailDrawer({ voucherId, onClose, onChanged, canWrite }) {
  const { data, loading, error, reload } = useLoad(`/admin/vouchers/${voucherId}`, undefined, [voucherId]);
  const v = data?.data;
  const [extending, setExtending] = useState(false);
  const [extendForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const extend = async (values) => {
    setSaving(true);
    try {
      await api.post(`/admin/vouchers/${voucherId}/extend`, { tambah_hari: values.tambah_hari, alasan: values.alasan.trim() });
      setExtending(false);
      extendForm.resetFields();
      reload();
      onChanged();
    } catch (err) {
      if (err.response?.status === 422) extendForm.setFields(fieldErrors(err));
      else Modal.error({ title: 'Gagal memperpanjang', content: errMsg(err) });
    } finally {
      setSaving(false);
    }
  };

  const rows = v
    ? [
        { key: 'kode', label: 'Kode', children: <code style={{ fontSize: 15 }}>{v.kode}</code> },
        { key: 'member', label: 'Member', children: <>{v.member_nama}<div className="cell-sub">{v.member_email || v.member_no_hp || '-'}</div></> },
        { key: 'reward', label: 'Reward', children: <>{v.reward_nama}{v.jumlah_poin ? <div className="cell-sub">{num(v.jumlah_poin)} poin</div> : null}</> },
        { key: 'status', label: 'Status', children: badge(statusOf(v)) },
        { key: 'sumber', label: 'Sumber', children: <>{VOUCHER_SUMBER[v.sumber] || v.sumber}{v.sumber === 'manual' && v.dibuat_oleh_nama ? <div className="cell-sub">oleh {v.dibuat_oleh_nama}</div> : null}</> },
        { key: 'redeem', label: 'Redeem', children: v.redeem_id ? <>#{v.redeem_id} · {v.redeem_status}{v.redeem_sumber === 'manual' ? ' (manual)' : ''}</> : '-' },
        { key: 'issued', label: 'Diterbitkan', children: fmtDateTime(v.issued_at) },
        {
          key: 'expired',
          label: 'Berlaku sampai',
          children: (
            <>
              {fmtDateTime(v.expires_at)}
              {statusOf(v) === 'active' && <div className="cell-sub">{sisaHari(v.expires_at) === 0 ? 'Berakhir hari ini' : `${num(sisaHari(v.expires_at))} hari lagi`}</div>}
            </>
          ),
        },
        v.reserved_at ? { key: 'reserved', label: 'Dipesan di checkout', children: <>{fmtDateTime(v.reserved_at)}<div className="cell-sub">Order {v.reserved_order_id} · sampai {fmtDateTime(v.reserved_until)}</div></> } : null,
        v.used_at ? { key: 'used', label: 'Terpakai', children: <>{fmtDateTime(v.used_at)}<div className="cell-sub">Order {v.used_order_id || '-'}</div></> } : null,
        v.voided_at ? { key: 'void', label: 'Dibatalkan', children: <>{fmtDateTime(v.voided_at)}<div className="cell-sub">{v.void_reason} · oleh {v.voided_oleh_nama || 'sistem'}</div></> } : null,
        v.catatan ? { key: 'catatan', label: 'Catatan', children: v.catatan } : null,
      ].filter(Boolean)
    : [];

  return (
    <>
      <Drawer title="Detail Voucher" width={520} open onClose={onClose} loading={loading}>
        {error && <Alert type="error" showIcon message={error} />}
        {v && (
          <>
            <Descriptions column={1} size="small" bordered items={rows} />
            {canWrite && statusOf(v) === 'active' && (
              <div className="actions" style={{ marginTop: 16 }}>
                <Button onClick={() => setExtending(true)}>Perpanjang masa berlaku</Button>
              </div>
            )}
          </>
        )}
      </Drawer>
      <Modal
        open={extending}
        title={`Perpanjang ${v?.kode || ''}`}
        onCancel={() => setExtending(false)}
        onOk={() => extendForm.submit()}
        confirmLoading={saving}
        okText="Perpanjang"
        cancelText="Batal"
        destroyOnHidden
        forceRender
      >
        <Form form={extendForm} layout="vertical" onFinish={extend} requiredMark={false} style={{ marginTop: 16 }}>
          <Form.Item name="tambah_hari" label="Tambah hari" rules={[{ required: true, message: 'Isi jumlah hari' }]} extra={v ? `Berlaku sampai saat ini ${dayjs(v.expires_at).format('DD MMM YYYY')}.` : ''}>
            <InputNumber style={{ width: '100%' }} min={1} max={365} />
          </Form.Item>
          <Form.Item name="alasan" label="Alasan" rules={[{ required: true, whitespace: true, min: 3, message: 'Alasan wajib diisi' }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// Manajemen voucher (tambahan.md poin 3): generate manual, pantau status & expiry, void, laporan redemption.
export default function Vouchers() {
  const { message } = App.useApp();
  const { canWrite } = useAdminRole();
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useLoad('/admin/vouchers', { page, limit: 15, ...filters }, [page, JSON.stringify(filters)]);
  const { data: rewards } = useLoad('/admin/rewards');
  const [generating, setGenerating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [voiding, setVoiding] = useState(null);

  const r = data?.meta.ringkasan;
  const setFilter = (patch) => {
    setFilters((f) => {
      const next = { ...f, ...patch };
      for (const key of Object.keys(next)) if (!next[key]) delete next[key];
      return next;
    });
    setPage(1);
  };

  const downloadCsv = async () => {
    const { data: blob } = await api.get('/admin/export/vouchers.csv', { params: filters, responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voucher.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runMaintenance = async () => {
    try {
      const { data: hasil } = await api.post('/admin/vouchers/maintenance');
      message.success(`Pembersihan selesai: ${hasil.data.expired} voucher kedaluwarsa, ${hasil.data.released} reservasi dilepas.`);
      reload();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const doVoid = async (alasan) => {
    try {
      await api.post(`/admin/vouchers/${voiding.id}/void`, { alasan });
      message.success('Voucher dibatalkan.');
      setVoiding(null);
      reload();
    } catch (err) {
      message.error(errMsg(err));
      throw err;
    }
  };

  return (
    <>
      <h1 className="page-title">Voucher</h1>
      <p className="page-sub">Generate voucher manual, pantau status dan masa berlaku, kelola laporan redemption.</p>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}><Stat label="Aktif" value={r ? num(r.aktif) : '–'} /></Col>
        <Col xs={12} md={6}><Stat label="Terpakai" value={r ? num(r.terpakai) : '–'} hint={r ? `${num(r.dipesan)} sedang di checkout` : null} /></Col>
        <Col xs={12} md={6}><Stat label="Kedaluwarsa" value={r ? num(r.kedaluwarsa) : '–'} hint={r && r.akan_kedaluwarsa ? `${num(r.akan_kedaluwarsa)} habis ≤ 7 hari` : null} /></Col>
        <Col xs={12} md={6}><Stat label="Total" value={r ? num(r.total) : '–'} hint={r ? `${num(r.dibatalkan)} dibatalkan · ${num(r.manual)} manual` : null} /></Col>
      </Row>
      <div className="actions" style={{ margin: '16px 0' }}>
        {canWrite && <Button type="primary" onClick={() => setGenerating(true)}>Generate Voucher</Button>}
        <Input.Search
          allowClear
          placeholder="Cari kode / nama member"
          style={{ width: 280, maxWidth: '100%' }}
          onSearch={(q) => setFilter({ q: q || undefined })}
        />
        <Select allowClear placeholder="Semua status" style={{ minWidth: 190 }} value={filters.status} onChange={(v) => setFilter({ status: v })}
          options={Object.entries(VOUCHER_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <Select allowClear placeholder="Semua sumber" style={{ minWidth: 160 }} value={filters.sumber} onChange={(v) => setFilter({ sumber: v })}
          options={Object.entries(VOUCHER_SUMBER).map(([value, label]) => ({ value, label }))} />
        <Input type="date" style={{ width: 160 }} value={filters.from} onChange={(e) => setFilter({ from: e.target.value || undefined })} placeholder="Diterbitkan mulai" />
        <Input type="date" style={{ width: 160 }} value={filters.to} onChange={(e) => setFilter({ to: e.target.value || undefined })} placeholder="Diterbitkan sampai" />
        <Button onClick={downloadCsv}>Export CSV</Button>
        {canWrite && (
          <Popconfirm
            title="Jalankan pembersihan expiry sekarang?"
            description="Voucher yang lewat masa berlaku akan ditandai kedaluwarsa dan reservasi yang lewat dilepas. Aman dijalankan kapan saja."
            okText="Jalankan"
            cancelText="Batal"
            onConfirm={runMaintenance}
          >
            <Button>Jalankan auto-expire</Button>
          </Popconfirm>
        )}
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.data || []}
        locale={{ emptyText: <EmptyState text="Belum ada voucher" /> }}
        pagination={{ current: page, pageSize: 15, total: data?.meta.total || 0, onChange: setPage, showSizeChanger: false }}
        scroll={{ x: 720 }}
        columns={[
          { title: 'Kode', dataIndex: 'kode', render: (k) => <code>{k}</code> },
          { title: 'Member', render: (_, row) => <>{row.member_nama}<div className="cell-sub">{row.member_email}</div></> },
          { title: 'Reward', dataIndex: 'reward_nama', responsive: ['md'] },
          { title: 'Sumber', dataIndex: 'sumber', render: (s) => <Tag>{VOUCHER_SUMBER[s] || s}</Tag>, responsive: ['lg'] },
          { title: 'Status', dataIndex: 'status', render: (_, row) => badge(statusOf(row)) },
          {
            title: 'Kedaluwarsa',
            dataIndex: 'expires_at',
            responsive: ['md'],
            render: (value, row) => (
              <>
                {fmtDateTime(value)}
                {statusOf(row) === 'active' && <div className="cell-sub">{sisaHari(value) === 0 ? 'Berakhir hari ini' : `${num(sisaHari(value))} hari lagi`}</div>}
              </>
            ),
          },
          { title: 'Dipakai', dataIndex: 'used_at', render: fmtDateTime, responsive: ['lg'] },
          {
            title: '',
            render: (_, row) => (
              <div className="actions">
                <Button size="small" onClick={() => setDetailId(row.id)}>Detail</Button>
                {canWrite && ['active', 'reserved'].includes(statusOf(row)) && <Button size="small" danger onClick={() => setVoiding(row)}>Void</Button>}
              </div>
            ),
          },
        ]}
      />
      <GenerateModal
        open={generating}
        onClose={() => setGenerating(false)}
        rewards={rewards}
        onDone={(created) => {
          setGenerating(false);
          message.success(`${created.length} voucher dibuat.`);
          reload();
        }}
      />
      {detailId && <DetailDrawer voucherId={detailId} onClose={() => setDetailId(null)} onChanged={reload} canWrite={canWrite} />}
      <ReasonModal
        open={!!voiding}
        danger
        title={`Void voucher ${voiding?.kode || ''}`}
        label="Alasan void"
        okText="Void voucher"
        description={
          voiding?.sumber === 'manual'
            ? 'Voucher ini diterbitkan manual: poin member akan dikembalikan ke saldo dan redeem manual dibatalkan.'
            : 'Kode voucher dicabut, tapi poin reward tetap tercatat terpakai karena redeem-nya sudah disetujui.'
        }
        onSubmit={doVoid}
        onCancel={() => setVoiding(null)}
      />
    </>
  );
}
