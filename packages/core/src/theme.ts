// Theme token compatibility for the statusline plugins.
//
// OpenCode 2.0.9 renamed the resolved text theme tokens: `text.subdued` became
// `text.muted`, and `text.feedback.<kind>.default` became
// `text.feedback.<kind>.base`. The plugins read both names so a released
// statusline keeps its colors on either runtime. A token that resolves to
// neither is left undefined, which renders in the terminal's default color.
export type StatusColors<T> = {
  /** Ordinary text (`text.muted` on 2.0.9+, `text.subdued` before). */
  muted?: T;
  /** Error feedback (`text.feedback.error.base`, or `.default` before 2.0.9). */
  error?: T;
  /** Info feedback (`text.feedback.info.base`, or `.default` before 2.0.9). */
  info?: T;
};

type ThemeLike = {
  text?: {
    muted?: unknown;
    subdued?: unknown;
    feedback?: Partial<Record<string, { base?: unknown; default?: unknown } | undefined>>;
  };
};

export function statusColors<T>(theme: unknown): StatusColors<T> {
  const text = (theme as ThemeLike | undefined)?.text;
  const feedback = (kind: string) =>
    text?.feedback?.[kind]?.base ?? text?.feedback?.[kind]?.default;
  return {
    muted: (text?.muted ?? text?.subdued) as T | undefined,
    error: feedback("error") as T | undefined,
    info: feedback("info") as T | undefined,
  };
}
