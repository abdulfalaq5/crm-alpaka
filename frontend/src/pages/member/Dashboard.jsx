import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Skeleton, Table, Tabs } from 'antd';
import { ArrowRightOutlined, GiftOutlined, HistoryOutlined, UploadOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { useLoad } from '../../hooks';
import { MUTATION, fmtDate, fmtDateTime, num, rupiah } from '../../format';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { useAuth } from '../../auth';

const JUDUL_MUTASI = {
  masuk: 'Poin masuk',
  hold: 'Poin ditahan',
  lepas: 'Hold dilepas',
  koreksi: 'Koreksi poin',
  kembalian: 'Poin dikembalikan',
};

const HERO = new URL('../../assets/morello-editorial.jpg', import.meta.url).href;

/** Satu aksi = satu baris: mutasi `terpakai` digabung dengan `hold` redeem sebelumnya. */
function susunAktivitas(list = []) {
  const rows = [];
  const terpakai = new Set();
  list.forEach((m) => {
    if (m.jenis === 'terpakai') {
      const hold = list.find(
        (h) => h.jenis === 'hold' && h.referensi_tipe === 'redeem' && h.referensi_id === m.referensi_id && !terpakai.has(h.id),
      );
      if (hold) {
        terpakai.add(hold.id);
        rows.push({ ...m, judul: JUDUL_MUTASI.terpakai, delta: -m.jumlah });
        return;
      }
    }
    rows.push({ ...m, judul: JUDUL_MUTASI[m.jenis] || MUTATION[m.jenis]?.label || m.jenis, delta: m.jumlah });
  });
  return rows;
}

function BarTier({ persen = 0 }) {
  const lebar = Math.min(100, Math.max(0, Number(persen) || 0));
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(lebar)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${lebar}%` }} />
    </div>
  );
}

function GiftCard({ r, tersedia, onOpen }) {
  const kurang = r.poin_dibutuhkan - tersedia;
  const terkunci = kurang > 0 || r.memenuhi_tier === false;
  const badge = r.tier_minimum_nama
    ? `Tier ${r.tier_minimum_nama}`
    : r.stok !== null && r.stok <= 3
      ? 'Stok menipis'
      : 'Tersedia';
  return (
    <div className={`gift-card${terkunci ? ' locked' : ''}`}>
      <div className="visual">
        {r.gambar_url ? <img src={r.gambar_url} alt={r.nama} loading="lazy" /> : <GiftOutlined style={{ fontSize: 28, opacity: 0.7 }} />}
        <span className="badge">{badge}</span>
      </div>
      <div className="body">
        <h3>{r.nama}</h3>
        <div className="foot">
          <span className="cost">
            <small>Butuh poin</small>
            <b>
              {num(r.poin_dibutuhkan)} <span>poin</span>
            </b>
          </span>
          <Button size="small" type="primary" ghost={terkunci} onClick={() => onOpen(r)} aria-label={`Detail ${r.nama}`}>
            {kurang > 0 ? 'Poin kurang' : r.bisa_ditukar ? 'Tukar poin' : 'Tersedia'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Activity({ data, loading, onLihatSemua }) {
  const rows = useMemo(() => susunAktivitas(data?.data || []), [data]);
  const total = data?.meta?.total || 0;
  return (
    <div className="activity">
      {loading && !rows.length && <Skeleton active style={{ padding: '20px 0' }} />}
      {!loading && rows.length === 0 && <EmptyState text="Belum ada aktivitas poin" />}
      {rows.map((r) => (
        <div className={`activity-row${r.delta < 0 ? ' out' : ''}`} key={r.id}>
          <div className="ico">{r.delta < 0 ? <GiftOutlined /> : <HistoryOutlined />}</div>
          <div className="who">
            <div className="t">{r.judul}</div>
            <div className="m">
              {r.keterangan ? `${r.keterangan} · ` : ''}
              {fmtDateTime(r.created_at)}
            </div>
          </div>
          <div className="delta" style={{ color: r.delta < 0 ? 'var(--color-text-primary)' : 'var(--color-success)' }}>
            {r.delta < 0 ? '−' : '+'}
            {num(Math.abs(r.delta))}
          </div>
        </div>
      ))}
      {total > rows.length && (
        <div className="activity-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="link-arrow dark" onClick={onLihatSemua}>
            Lihat semua {num(total)} mutasi poin <ArrowRightOutlined style={{ fontSize: 10 }} />
          </button>
        </div>
      )}
    </div>
  );
}

function MutasiTable() {
  const [page, setPage] = useState(1);
  const { data, loading } = useLoad('/member/points/mutations', { page, limit: 10 }, [page]);
  return (
    <Table
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={data?.data || []}
      locale={{ emptyText: <EmptyState text="Belum ada mutasi poin" /> }}
      pagination={{ current: page, pageSize: 10, total: data?.meta?.total || 0, onChange: setPage, showSizeChanger: false }}
      columns={[
        { title: 'Tanggal', dataIndex: 'created_at', render: fmtDateTime, responsive: ['sm'] },
        { title: 'Jenis', dataIndex: 'jenis', render: (j) => MUTATION[j]?.label || j },
        {
          title: 'Keterangan',
          dataIndex: 'keterangan',
          render: (k, r) =>
            r.referensi_tipe === 'receipt' ? `Struk ${k}` : r.referensi_tipe === 'koreksi' ? `Koreksi struk ${k}` : `Redeem ${k || ''}`,
        },
        {
          title: 'Poin',
          align: 'right',
          render: (_, r) => (
            <b style={{ color: `var(--color-${MUTATION[r.jenis]?.color || 'neutral'})` }}>
              {MUTATION[r.jenis]?.sign}
              {num(r.jumlah)}
            </b>
          ),
        },
      ]}
    />
  );
}

// Dashboard member (DSH-01..03, DSH-06). Angka dan status diambil dari backend, tidak dihitung ulang.
// Tampilan mengikuti referensi desain "More Rewards Hub" (morello-member-hub).
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('ringkasan');
  const { data, loading, error } = useLoad('/member/dashboard');
  const { data: tier, loading: tierLoading, error: tierError } = useLoad('/member/tier');
  const { data: rewards, loading: rewardsLoading } = useLoad('/rewards');
  const { data: mutasi, loading: mutasiLoading } = useLoad('/member/points/mutations', { page: 1, limit: 6 });
  const d = data?.data;
  const t = tier?.data;
  const tersedia = d?.points?.tersedia || 0;
  const katalog = (rewards?.data || []).slice(0, 3);

  return (
    <div className="dash">
      <header className="dash-greet soft-in">
        <div>
          <p className="kicker">Selamat datang kembali</p>
          <h1>
            Halo, {user?.nama?.split(' ')[0]}
            <span className="dot">.</span>
          </h1>
          <p className="sub">Semua keuntungan member, dalam satu tempat.</p>
        </div>
        {t?.tier_saat_ini && (
          <span className="tier-pill">
            <span className="led" />
            {t.tier_saat_ini.nama} member
          </span>
        )}
      </header>

      {error && <Alert type="error" showIcon message={error} />}
      {loading && !d && <Skeleton active />}

      {d && (
        <>
          <section className="dash-hero soft-in">
            <div className="hero-banner">
              <img src={HERO} alt="Kurasi hadiah member" />
              <div className="fade" />
              <div className="inner">
                <div>
                  <p className="kicker">Poin loyalitas</p>
                  <h2>
                    Hadiah tanpa
                    <br />
                    batas, poinmu.
                  </h2>
                </div>
                <Button className="cta" type="primary" icon={<GiftOutlined />} onClick={() => navigate('/redeem')}>
                  Tukar poin
                </Button>
              </div>
            </div>
            <div className="hero-points">
              <div>
                <p className="kicker">Saldo poin kamu</p>
                <p className="amount">{num(tersedia)}</p>
                <p className="unit">poin siap ditukar</p>
                <div className="split">
                  <div>
                    <b>{num(d.points.total)}</b>total poin
                  </div>
                  <div>
                    <b>{num(d.points.ditahan)}</b>ditahan (hold)
                  </div>
                </div>
              </div>
              <div className="foot">
                <span>More points, more perks</span>
                <Link className="link-arrow" to="/redeem">
                  Tukar sekarang <ArrowRightOutlined style={{ fontSize: 10 }} />
                </Link>
              </div>
            </div>
          </section>

          <section className="dash-two soft-in">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="kicker">Tier member</p>
                  <h3>
                    {tierLoading && !t ? 'Memuat…' : t?.tier_saat_ini?.nama || 'Belum ada tier'}
                    {t?.tier_berikutnya && <span className="soft"> menuju ke {t.tier_berikutnya.nama}</span>}
                  </h3>
                </div>
                {t?.tier_saat_ini && <span className="tier-pill">{t.tier_saat_ini.nama}</span>}
              </div>
              {tierError && <Alert type="error" showIcon message={tierError} style={{ marginTop: 16 }} />}
              <div className="panel-body">
                {t ? (
                  t.tier_berikutnya ? (
                    <>
                      <BarTier persen={t.persen} />
                      <div className="bar-note">
                        <span>{num(t.poin_saat_ini)} poin lifetime</span>
                        <span>{num(t.poin_dibutuhkan)} poin lagi</span>
                      </div>
                    </>
                  ) : (
                    <span style={{ color: 'var(--color-success)' }}>Anda sudah berada di tier tertinggi.</span>
                  )
                ) : (
                  !tierLoading && 'Progress tier belum dapat dimuat.'
                )}
              </div>
              {t?.tier_saat_ini?.benefit && <div className="panel-body foot">Benefit: {t.tier_saat_ini.benefit}</div>}
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="kicker">Dompet kamu</p>
                  <h3>
                    {d.voucher_aktif?.total > 0 ? (
                      <>
                        {num(d.voucher_aktif.total)} <span className="soft">voucher aktif</span>
                      </>
                    ) : (
                      <span className="soft">Belum ada voucher aktif</span>
                    )}
                  </h3>
                </div>
                <GiftOutlined style={{ fontSize: 22, color: 'var(--color-text-secondary)' }} />
              </div>
              {d.voucher_aktif?.total > 0 ? (
                <>
                  <div className="code-chips">
                    {d.voucher_aktif.terbaru.map((v) => (
                      <code key={v.id}>{v.kode}</code>
                    ))}
                  </div>
                  <div className="panel-body foot">
                    {d.voucher_aktif.terbaru[0]?.reward_nama} · berlaku sampai {fmtDate(d.voucher_aktif.terbaru[0]?.expires_at)}
                  </div>
                </>
              ) : (
                <div className="panel-body">Tukarkan poinmu untuk mendapatkan voucher dan reward eksklusif.</div>
              )}
              <div className="foot">
                <Link className="link-arrow dark" to="/voucher">
                  Lihat semua voucher <ArrowRightOutlined style={{ fontSize: 10 }} />
                </Link>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="soft-in">
        <div className="section-head">
          <div>
            <p className="kicker">Kurasi untukmu</p>
            <h2>Tukarkan poinmu</h2>
          </div>
          <Link className="link-arrow dark" to="/redeem">
            Lihat semua reward <ArrowRightOutlined style={{ fontSize: 10 }} />
          </Link>
        </div>
        {rewardsLoading && <Skeleton active paragraph={{ rows: 4 }} />}
        {!rewardsLoading && katalog.length === 0 && <EmptyState text="Belum ada reward yang tersedia" />}
        {katalog.length > 0 && (
          <div className="gift-grid">
            {katalog.map((r) => (
              <GiftCard key={r.id} r={r} tersedia={tersedia} onOpen={() => navigate('/redeem')} />
            ))}
          </div>
        )}
      </section>

      <section className="soft-in">
        <div className="section-head">
          <div>
            <p className="kicker">Aktivitas terbaru</p>
            <h2>Poin masuk & keluar</h2>
          </div>
        </div>
        <Activity data={mutasi} loading={mutasiLoading} onLihatSemua={() => setTab('mutasi')} />
      </section>

      {d && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate('/upload')}>
              Upload Struk
            </Button>
            <Button icon={<GiftOutlined />} onClick={() => navigate('/redeem')}>
              Tukar Poin
            </Button>
          </div>

          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'ringkasan',
                label: 'Struk & Redeem',
                children: (
                  <>
                    <div className="card">
                      <p className="section-label">Struk terakhir</p>
                      {d.struk_terbaru.length === 0 ? (
                        <EmptyState text="Belum ada struk yang diunggah" />
                      ) : (
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={d.struk_terbaru}
                          onRow={(r) => ({ onClick: () => navigate(`/struk/${r.id}`), className: 'clickable-row' })}
                          columns={[
                            { title: 'Tanggal', dataIndex: 'tanggal_transaksi', render: fmtDate },
                            { title: 'Channel', dataIndex: 'channel', responsive: ['md'] },
                            { title: 'Nominal', dataIndex: 'nominal', render: rupiah },
                            { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s} /> },
                            { title: 'Poin', dataIndex: 'poin_diperoleh', align: 'right', render: (p) => (p ? `+${num(p)}` : '-'), responsive: ['sm'] },
                          ]}
                        />
                      )}
                      <div style={{ marginTop: 8 }}><Link to="/struk">Lihat semua struk</Link></div>
                    </div>
                    <div className="card">
                      <p className="section-label">Redeem terakhir</p>
                      {d.redeem_terbaru.length === 0 ? (
                        <EmptyState text="Belum ada redeem" />
                      ) : (
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={d.redeem_terbaru}
                          columns={[
                            { title: 'Tanggal', dataIndex: 'created_at', render: fmtDate, responsive: ['sm'] },
                            { title: 'Reward', dataIndex: 'reward_nama' },
                            { title: 'Poin', dataIndex: 'jumlah_poin', render: num },
                            { title: 'Status', dataIndex: 'status', render: (s) => <StatusBadge status={s} /> },
                          ]}
                        />
                      )}
                      <div style={{ marginTop: 8 }}><Link to="/redeem">Lihat riwayat redeem</Link></div>
                    </div>
                  </>
                ),
              },
              { key: 'mutasi', label: 'Mutasi Poin', children: <MutasiTable /> },
            ]}
          />
        </>
      )}
    </div>
  );
}
