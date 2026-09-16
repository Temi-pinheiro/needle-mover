/**
 * Choosing which workflow state to move an issue into.
 *
 * Teams name their states freely ("In Progress", "Doing", "Shipped"), so we
 * match on Linear's `type` and take the earliest by board position — the
 * leftmost "started" column is the one a person would drag the card to.
 */

export type WorkflowState = {
  id: string;
  name: string;
  type: string;
  position: number;
};

export function pickState(states: WorkflowState[], type: string): WorkflowState | null {
  const matching = states.filter((s) => s.type === type);
  if (matching.length === 0) return null;
  return matching.reduce((earliest, s) => (s.position < earliest.position ? s : earliest));
}

/** True when the issue is already in the state we were about to move it to. */
export function alreadyIn(currentType: string, targetType: string): boolean {
  return currentType === targetType;
}
