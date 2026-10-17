export function queueChanges(previous, current) {
  if (!previous) return [];
  const known = new Map(previous.map((row) => [row.case_id, row]));
  return current.flatMap((row) => {
    const old = known.get(row.case_id);
    return !old
      ? [{ ...row, type: "arrived" }]
      : old.status !== row.status
        ? [{ ...row, type: "updated" }]
        : [];
  });
}

// A visitor switching from reporting to staff did not have the queue open at
// arrival. Surface current server priority without pretending it arrived now.
export function initialPriorityAlerts(rows) {
  return rows
    .filter(
      (row) =>
        row.clock?.golden_hour_remaining > 0 &&
        !["completed", "approved"].includes(row.status) &&
        row.followup?.state !== "awaiting_external",
    )
    .map((row) => ({ ...row, type: "priority" }));
}
