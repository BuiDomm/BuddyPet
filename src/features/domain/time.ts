/** Returns the wall-clock minutes until the next local midnight, including DST shifts. */
export function minutesUntilLocalTomorrow(now = new Date()): number {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((tomorrow.getTime() - now.getTime()) / 60_000));
}
