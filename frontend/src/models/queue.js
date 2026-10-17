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
