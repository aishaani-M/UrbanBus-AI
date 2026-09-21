export function formatDistanceToNow(timestamp) {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDateTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
