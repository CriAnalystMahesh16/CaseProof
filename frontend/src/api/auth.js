// Staff credentials live only in this module's memory. Victim calls use cookies.
export function createAuth(profile = "local", now = Date.now) {
  let token = null,
    expires = 0;
  return {
    profile,
    accept(value, expiresAt) {
      token = value;
      expires = expiresAt;
    },
    clear() {
      token = null;
      expires = 0;
    },
    ready() {
      return profile === "local" || Boolean(token && now() < expires);
    },
    headers(persona) {
      if (!persona) return {};
      if (profile === "cloud") {
        if (!token || now() >= expires) {
          token = null;
          throw new Error("Sign in to the staff workspace again.");
        }
        return { Authorization: `Bearer ${token}` };
      }
      if (!["analyst", "reviewer", "admin"].includes(persona))
        throw new Error("Unsupported demo identity");
      return { "X-Demo-User": persona };
    },
  };
}
export const auth = createAuth(
  import.meta.env.VITE_AUTH_PROFILE === "cloud" ? "cloud" : "local",
);
// Cloud permissions are enforced by the server. No role-discovery endpoint exists yet.
export const canRequestRole = (persona, role) =>
  auth.profile === "cloud" || persona === role || persona === "admin";
