// Which connection label, if any, the statusline shows next to the title.
//
// The label disambiguates several Copilot accounts; with a single one it is
// redundant. OpenCode reports every connection for the `github-copilot`
// integration: a credential carries the user-editable `label`, an environment
// connection has only a `name`. The label is therefore shown only when more
// than one connection carries one.
export type ConnectionSlice = { type: string; id?: string; label?: string; name?: string };

/** The trimmed, user-editable label of a credential connection; env connections have none. */
export function connectionLabel(connection: ConnectionSlice): string | undefined {
  return connection.type === "credential" ? connection.label?.trim() || undefined : undefined;
}

/**
 * The label to show after the title, or `undefined` to omit it.
 *
 * `connections` is the integration's full connection list; passing `undefined`
 * (the list could not be read) keeps the label, so an unknown account count
 * never hides a needed disambiguator.
 */
export function displayAccount(
  active: ConnectionSlice,
  connections: readonly ConnectionSlice[] | undefined,
): string | undefined {
  const label = connectionLabel(active);
  if (!label) return undefined;
  if (!connections) return label;
  return connections.filter((connection) => connectionLabel(connection)).length > 1
    ? label
    : undefined;
}
