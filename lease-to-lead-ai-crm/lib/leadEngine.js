function monthsRemaining(leaseEndDate) {
  const now = new Date();
  const end = new Date(leaseEndDate);
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(0, months + (end.getDate() >= now.getDate() ? 0 : -1));
}

export function calculateStage(lease_end_date) {
  const months = monthsRemaining(lease_end_date);
  if (months <= 3) return "HOT";
  if (months <= 5) return "WARM";
  return "COLD";
}

export function updateScore(eventType, currentScore = 0) {
  const map = {
    open: 1,
    click: 3,
    reply: 5
  };

  const next = currentScore + (map[eventType] || 0);
  return next;
}
