export function formatMinor(value) {
  if (value == null) return "—";
  if (!Number.isSafeInteger(value)) throw new Error("Unsupported money value");
  const amount = BigInt(value),
    absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}₹${new Intl.NumberFormat("en-IN").format(absolute / 100n)}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function remaining(minutes) {
  if (minutes == null) return "Unknown";
  const seconds = Math.max(0, Math.floor(minutes * 60));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function remainingAt(clock,now=Date.now()) {
  if(clock?.golden_hour_remaining==null)return null;
  if(clock.replay)return clock.golden_hour_remaining;
  const sampled=Date.parse(clock.as_of);
  return Number.isFinite(sampled)?Math.max(0,clock.golden_hour_remaining-Math.max(0,now-sampled)/60000):null;
}
export const time = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Calcutta",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(value)) + " IST"
    : "Unknown time";
export const label = (value) =>
  String(value ?? "Unknown")
    .replaceAll("_", " ")
    .toLowerCase();
export function makeCaseView(snapshot, workflow) {
  if (
    snapshot.case_id !== workflow.case_id ||
    snapshot.revision !== workflow.revision ||
    snapshot.digest !== workflow.digest
  )
    throw new Error("Updating assessment");
  return {
    snapshot,
    workflow,
    identity: {
      caseId: snapshot.case_id,
      revision: snapshot.revision,
      digest: snapshot.digest,
    },
    amounts: {
      confirmed: workflow.confirmed_disputed_minor ?? 0,
      candidate: workflow.additional_candidate_minor ?? 0,
    },
    mutable:
      !workflow.bank_data_refresh_required &&
      !["processing", "failed", "needs_analysis"].includes(workflow.status),
  };
}
