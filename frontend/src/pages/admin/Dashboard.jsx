import { Alert, Button, Skeleton } from 'antd';
import {
  ArrowRightOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  GiftOutlined,
  SwapOutlined,
  TagOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import { useLoad } from '../../hooks';
import { fmtDate, num, rupiah } from '../../format';
import EmptyState from '../../components/EmptyState';

const PEMBULATAN = { bawah: 'Ke bawah', atas: 'Ke atas', terdekat: 'Terdekat' };

// href biasa tidak menyertakan token (Authorization ada di header, bukan cookie) — unduh lewat blob.
async function downloadCsv(path, filename) {
  const { data } = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Stat = ({ label, value, sub }) => (
  <div className="metric">
    <p className="kicker">{label}</p>
    <p className="value">{value}</p>
    {sub && <p className="sub">{sub}</p>}
  </div>
);

const Row = ({ label, value, tone }) => (
  <div className="mini-row">
    <span>{label}</span>
    <b className={tone}>{value}</b>
  </div>
);

const Bar = ({ value, max }) => {
  const lebar = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar" role="progressbar" aria-valuenow={lebar} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${lebar}%` }} />
    </div>
  );
};

const Panel = ({ kicker, title, icon, to, children, action = 'Kelola' }) => (
  <div className="panel">
    <div className="panel-head">
      <div>
        <p className="kicker">{kicker}</p>
        <h3>{title}</h3>
      </div>
      {icon}
    </div>
    <div className="panel-body">{children}</div>
    {to && (
      <div className="foot">
        <Link className="link-arrow dark" to={to}>
          {action} <ArrowRightOutlined style={{ fontSize: 10 }} />
        </Link>
      </div>
    )}
  </div>
);

// Dashboard admin: satu kartu per domain (member, struk, aturan poin, reward, voucher) + metrik dasar.
// Semua angka dari endpoint /admin/metrics (agregat backend), bukan dihitung ulang di frontend.
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data, loading, error } = useLoad('/admin/metrics');
  const m = data?.data;
  const tierMax = Math.max(1, ...(m?.member?.tier || []).map((t) => t.jumlah_member));

  return (
    <div className="dash dense adash">
      <header className="dash-greet soft-in">
        <div>
          <p className="kicker">Ringkasan program</p>
          <h1>
            Dashboard
            <span className="dot">.</span>
          </h1>
          <p className="sub">Kondisi member, struk, aturan poin, reward, dan voucher dalam satu layar.</p>
        </div>
        <div className="actions">
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadCsv('/admin/export/members.csv', 'member.csv')}>
            Member
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadCsv('/admin/export/receipts.csv', 'struk.csv')}>
            Struk
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadCsv('/admin/export/redeems.csv', 'redeem.csv')}>
            Redeem
          </Button>
        </div>
      </header>

      {error && <Alert type="error" showIcon message={error} />}
      {loading && !m && <Skeleton active paragraph={{ rows: 6 }} />}

      {m && (
        <>
          <section className="metric-strip soft-in">
            <Stat label="Member aktif" value={num(m.member_aktif)} sub={`dari ${num(m.member_total)} total`} />
            <Stat label="Poin beredar" value={num(m.poin_beredar)} sub={`+${num(m.poin_bulan.masuk)} masuk 30 hari`} />
            <Stat
              label="Struk menunggu"
              value={num(m.struk.menunggu_review)}
              sub={`${num(m.struk.total)} struk terkirim`}
            />
            <Stat label="Redemption rate" value={`${m.redemption_rate}%`} sub="redeem selesai / total" />
          </section>

          <section className="adash-grid soft-in">
            <Panel kicker="Member" title={`${num(m.member.total)} member`} icon={<TeamOutlined style={{ fontSize: 22, color: 'var(--color-text-secondary)' }} />} to="/admin/member">
              <Row label="Aktif" value={num(m.member.aktif)} />
              <Row label="Nonaktif" value={num(m.member.nonaktif)} />
              <Row label="Daftar 30 hari" value={num(m.member.baru_bulan)} />
              <div className="tier-bars">
                {m.member.tier.map((t) => (
                  <div className="tier-bar" key={t.nama}>
                    <div className="bar-note">
                      <span>{t.nama}</span>
                      <b>{num(t.jumlah_member)}</b>
                    </div>
                    <Bar value={t.jumlah_member} max={tierMax} />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              kicker="Invoice"
              title={m.struk.menunggu_review > 0 ? `${num(m.struk.menunggu_review)} perlu review` : 'Antrean bersih'}
              icon={<FileDoneOutlined style={{ fontSize: 22, color: 'var(--color-text-secondary)' }} />}
              to="/admin/struk"
              action="Buka antrean struk"
            >
              <Row label="Total struk" value={num(m.struk.total)} />
              <Row label="Menunggu review" value={num(m.struk.menunggu_review)} tone={m.struk.menunggu_review ? 'warn' : undefined} />
              <Row label="Disetujui" value={num(m.struk.disetujui)} />
              <Row label="Ditolak" value={num(m.struk.ditolak)} />
              <div className="panel-body foot">
                30 hari terakhir: {num(m.struk.disetujui_bulan)} disetujui, {num(m.struk.ditolak_bulan)} ditolak.
              </div>
            </Panel>

            <Panel
              kicker="Point rules"
              title={m.point_rule.rupiah_per_poin ? `${rupiah(m.point_rule.rupiah_per_poin)} / poin` : 'Belum diatur'}
              icon={<ThunderboltOutlined style={{ fontSize: 22, color: 'var(--color-text-secondary)' }} />}
              to="/admin/pengaturan"
              action="Atur poin"
            >
              <Row label="Rupiah per poin" value={m.point_rule.rupiah_per_poin ? rupiah(m.point_rule.rupiah_per_poin) : '–'} />
              <Row label="Pembulatan" value={PEMBULATAN[m.point_rule.pembulatan] || m.point_rule.pembulatan || '–'} />
              <Row label="Minimal transaksi" value={rupiah(m.point_rule.minimal_transaksi || 0)} />
              <Row label="Aturan channel" value={`${num(m.point_rule.channel)} channel`} />
            </Panel>

            <Panel
              kicker="Reward"
              title={`${num(m.reward.total)} reward`}
              icon={<GiftOutlined style={{ fontSize: 22, color: 'var(--color-text-secondary)' }} />}
              to="/admin/reward"
            >
              <Row label="Aktif" value={num(m.reward.aktif)} />
              <Row label="Nonaktif" value={num(m.reward.total - m.reward.aktif)} />
              <Row label="Stok habis" value={num(m.reward.stok_habis)} tone={m.reward.stok_habis ? 'warn' : undefined} />
              <Row label="Khusus tier" value={num(m.reward.tier_khusus)} />
              <div className="panel-body foot">
                {m.reward.berlaku_sampai ? `Berlaku paling lambat ${fmtDate(m.reward.berlaku_sampai)}.` : 'Seluruh reward berlaku tanpa batas waktu.'}
              </div>
            </Panel>

            <Panel
              kicker="Voucher"
              title={`${num(m.voucher.active)} aktif`}
              icon={<TagOutlined style={{ fontSize: 22, color: 'var(--color-text-secondary)' }} />}
              to="/admin/voucher"
            >
              <Row label="Aktif" value={num(m.voucher.active)} />
              <Row label="Reserved" value={num(m.voucher.reserved)} />
              <Row label="Terpakai" value={num(m.voucher.used)} />
              <Row label="Kedaluwarsa" value={num(m.voucher.expired)} />
              <Row label="Void" value={num(m.voucher.void)} />
            </Panel>

            <Panel
              kicker="Performa"
              title="Reward terlaris"
              icon={<TrophyOutlined style={{ fontSize: 22, color: 'var(--color-text-secondary)' }} />}
              to="/admin/redeem"
              action="Buka antrean redeem"
            >
              {m.top_reward.length === 0 ? (
                <EmptyState text="Belum ada redeem selesai" />
              ) : (
                m.top_reward.map((r, i) => (
                  <Row key={r.nama} label={`${i + 1}. ${r.nama}`} value={`${num(r.jumlah)}x`} />
                ))
              )}
              <div className="panel-body foot">
                <SwapOutlined /> {num(m.poin_bulan.keluar)} poin keluar 30 hari terakhir.
              </div>
            </Panel>
          </section>

          <div className="actions soft-in">
            <Button type="primary" onClick={() => navigate('/admin/struk')}>
              Review Struk ({num(m.struk.menunggu_review)})
            </Button>
            <Button onClick={() => navigate('/admin/member')}>Kelola Member</Button>
            <Button onClick={() => navigate('/admin/voucher')}>Kelola Voucher</Button>
          </div>
        </>
      )}
    </div>
  );
}
