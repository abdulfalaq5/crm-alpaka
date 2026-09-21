import { Image, Skeleton, Typography } from 'antd';
import { useBlobUrl } from '../hooks';

// Preview gambar (bisa di-zoom) atau PDF untuk bukti struk; dipakai halaman member maupun admin.
export default function FilePreview({ path, name }) {
  const { url, mime, loading, error } = useBlobUrl(path);
  return (
    <div className="file-tile">
      {loading && <Skeleton.Image active style={{ width: '100%', height: 200 }} />}
      {error && <Typography.Text type="danger">File bukti tidak dapat dimuat.</Typography.Text>}
      {url && mime === 'application/pdf' && (
        <>
          <iframe src={url} title={name} />
          <a href={url} target="_blank" rel="noreferrer">
            Buka PDF di tab baru
          </a>
        </>
      )}
      {url && mime?.startsWith('image/') && <Image src={url} alt={name} />}
      {name && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{name}</div>}
    </div>
  );
}
