/** Languages the statusline plugins ship labels for. */
export const LANGUAGES = ["en", "zh-CN"] as const

export type Language = (typeof LANGUAGES)[number]

/**
 * Resolve the display language from the terminal locale:
 * `LC_ALL` → `LC_MESSAGES` → `LANGUAGE` → `LANG`; `zh*` locales map to `zh-CN`.
 */
export function detectLanguage(env: Record<string, string | undefined> = process.env): Language {
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANGUAGE || env.LANG || ""
  return /^zh([_.-]|$)/i.test(locale) ? "zh-CN" : "en"
}

/**
 * Resolve the language from plugin options, first match wins, falling back to
 * the terminal locale. Accepts `"en"`, `"zh"`, and `"zh-CN"`.
 *
 * Callers pass the options in priority order: `cli.json` plugin options, then
 * the server plugin's option relayed over the RPC.
 */
export function resolveLanguage(...options: unknown[]): Language {
  for (const option of options) {
    if (option === "en") return "en"
    if (option === "zh" || option === "zh-CN") return "zh-CN"
  }
  return detectLanguage()
}
