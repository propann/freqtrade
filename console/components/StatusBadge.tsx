type StatusBadgeProps = {
  status: 'running' | 'stopped' | 'paused' | 'warning';
  label?: string;
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  return <span className={`status-badge ${status}`}>{label ?? status}</span>;
}
