import { Empty } from 'antd';

export default function EmptyState({ text, children }) {
  return (
    <div className="empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />
      {children}
    </div>
  );
}
