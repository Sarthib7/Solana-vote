export function getSessionStateLabel(
  sessionState: { active: {} } | { paused: {} } | { ended: {} }
): string {
  if ("paused" in sessionState) return "Paused";
  if ("ended" in sessionState) return "Closed";
  return "Live";
}
