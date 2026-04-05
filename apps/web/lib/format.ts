export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function getVerdictColor(passRate: number): string {
  if (passRate >= 95) return '#16A34A';
  if (passRate >= 80) return '#D97706';
  return '#DC2626';
}
