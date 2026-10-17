import { makeCaseView } from "../models/caseView.js";
import { auth } from "./auth.js";
export class ApiError extends Error {
  constructor(status, body) {
    const fields = Array.isArray(body.detail)
      ? Object.fromEntries(body.detail.map((d) => [d.loc?.at(-1), d.msg]))
      : {};
    const code =
      body.error ||
      (typeof body.detail === "string" ? body.detail : undefined) ||
      `Request failed (${status})`;
    super(
      status === 403
        ? "Session expired or this action is not permitted."
        : status === 404
          ? "This item is unavailable."
          : status === 409
            ? "The case changed. Reload the current assessment before trying again."
            : code,
    );
    Object.assign(this, {
      status,
      code,
      fieldErrors: fields,
      retryable: status >= 500 || status === 429,
    });
  }
}
export async function apiRequest(
  path,
  { method = "GET", body, persona, signal, fetcher = fetch, raw = false } = {},
) {
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = {
    ...auth.headers(persona),
    ...(body && !form ? { "Content-Type": "application/json" } : {}),
  };
  const response = await fetcher(path, {
    method,
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
    headers,
    signal,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401 && auth.profile === "cloud") auth.clear();
    let data;
    try {
      data = await response.json();
    } catch {
      data = {
        error:
          response.status === 413
            ? "Attachment is too large."
            : "Request could not be completed.",
      };
    }
    throw new ApiError(response.status, data);
  }
  return raw ? response : response.status === 204 ? null : response.json();
}
export async function loadCaseView(caseId, options = {}) {
  const path = "/v1/cases/" + encodeURIComponent(caseId);
  for (let i = 0; i < 3; i++) {
    const [snapshot, workflow] = await Promise.all([
      apiRequest(path, options),
      apiRequest(path + "/workflow", options),
    ]);
    try {
      return makeCaseView(snapshot, workflow);
    } catch (error) {
      if (i === 2) throw error;
    }
  }
}
export const post = (path, body, persona) =>
  apiRequest(path, { method: "POST", body, persona });
export function evidenceForm(file, kind = "receipt", revision) {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  if (revision != null) form.append("expected_revision", revision);
  return form;
}
