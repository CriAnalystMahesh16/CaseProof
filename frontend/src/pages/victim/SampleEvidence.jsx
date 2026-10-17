import React, { useState } from "react";
import "./sample-evidence.css";
import { apiRequest } from "../../api/client.js";
import { useResource, useAction } from "../../state/resources.jsx";
import { ErrorBanner } from "../../components/live.jsx";

export default function SampleEvidence({
  selected,
  narrative,
  setFiles,
  count,
}) {
  const resource = useResource(
    "sample-capabilities",
    (signal) => apiRequest("/v1/victim/sample-evidence", { signal }),
    60000,
  );
  const action = useAction();
  const [ai, setAi] = useState(false);
  async function create(kind) {
    await action
      .run(async () => {
        const response = await apiRequest("/v1/victim/sample-evidence", {
          method: "POST",
          raw: true,
          body: { transaction_id: selected[0], kind, narrative, ai },
        });
        const blob = await response.blob();
        const file = new File([blob], `synthetic-${kind}-${selected[0]}.png`, {
          type: "image/png",
        });
        setFiles((old) => [...old, { file, kind }]);
      })
      .catch(() => {});
  }
  return (
    <section className="sample-evidence" aria-labelledby="sample-title">
      <h3 id="sample-title">Need practice evidence?</h3>
      <p>
        Create an explicitly marked fictional sample for your selected payment,
        or upload your own files below. Samples do not create bank transactions
        or downstream observations.
      </p>
      <p>
        The practice receipt is a crop without its reference. The analyst must
        match its visible payee and time against bank records.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={ai}
          disabled={!resource.data?.ai_available || action.busy}
          onChange={(e) => setAi(e.target.checked)}
        />{" "}
        Use AI to write the fictional example
      </label>
      {!resource.data?.ai_available && (
        <p className="muted">
          AI sample generation is unavailable in this provider mode. Simulator
          samples are available; they are not AI-generated.
        </p>
      )}
      {!selected.length && (
        <p className="muted">
          Select a bank payment first to create a matching sample.
        </p>
      )}
      <ErrorBanner error={resource.error || action.error} />
      <div className="row gap8 wrap">
        {[
          ["receipt", "receipt"],
          ["messages", "chat"],
          ["call_log", "call log"],
        ].map(([kind, title]) => (
          <button
            key={kind}
            className="btn sm"
            disabled={!selected.length || count >= 5 || action.busy}
            onClick={() => create(kind)}
          >
            {action.busy ? "Creating sample…" : `Create synthetic ${title}`}
          </button>
        ))}
      </div>
      {count >= 5 && (
        <p className="muted">
          Five attachments selected. Remove one before creating another.
        </p>
      )}
    </section>
  );
}
