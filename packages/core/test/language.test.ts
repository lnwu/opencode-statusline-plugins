import { describe, expect, test } from "bun:test"
import { detectLanguage, resolveLanguage } from "../src/language"

const LOCALE_KEYS = ["LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG"] as const

function withoutLocale(fn: () => void): void {
  const saved = LOCALE_KEYS.map((key) => [key, process.env[key]] as const)
  for (const key of LOCALE_KEYS) delete process.env[key]
  try {
    fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe("detectLanguage", () => {
  test("prefers LC_ALL over the other locale variables", () => {
    expect(detectLanguage({ LC_ALL: "zh_CN.UTF-8", LANG: "en_US.UTF-8" })).toBe("zh-CN")
    expect(detectLanguage({ LC_ALL: "en_US.UTF-8", LANG: "zh_CN.UTF-8" })).toBe("en")
  })

  test("falls back through LC_MESSAGES, LANGUAGE, LANG", () => {
    expect(detectLanguage({ LC_MESSAGES: "zh_CN.UTF-8" })).toBe("zh-CN")
    expect(detectLanguage({ LANGUAGE: "zh_CN" })).toBe("zh-CN")
    expect(detectLanguage({ LANG: "zh_CN.UTF-8" })).toBe("zh-CN")
  })

  test("accepts zh locale spellings", () => {
    for (const locale of ["zh", "zh_CN", "zh-CN", "zh_CN.UTF-8", "ZH_cn.utf8"]) {
      expect(detectLanguage({ LANG: locale })).toBe("zh-CN")
    }
  })

  test("maps everything else to en", () => {
    expect(detectLanguage({})).toBe("en")
    expect(detectLanguage({ LANG: "" })).toBe("en")
    expect(detectLanguage({ LANG: "en_US.UTF-8" })).toBe("en")
    expect(detectLanguage({ LANG: "de_DE.UTF-8" })).toBe("en")
    expect(detectLanguage({ LANG: "zhx" })).toBe("en")
  })

  test("reads process.env when no env object is given", () => {
    withoutLocale(() => {
      process.env.LANG = "zh_CN.UTF-8"
      expect(detectLanguage()).toBe("zh-CN")
    })
  })
})

describe("resolveLanguage", () => {
  test("accepts en, zh, and zh-CN options", () => {
    expect(resolveLanguage("en")).toBe("en")
    expect(resolveLanguage("zh")).toBe("zh-CN")
    expect(resolveLanguage("zh-CN")).toBe("zh-CN")
  })

  test("returns the first matching option", () => {
    expect(resolveLanguage("en", "zh-CN")).toBe("en")
    expect(resolveLanguage("zh-CN", "en")).toBe("zh-CN")
    expect(resolveLanguage(undefined, "zh")).toBe("zh-CN")
  })

  test("ignores unknown options and falls back to the terminal locale", () => {
    withoutLocale(() => {
      expect(resolveLanguage("fr", 1)).toBe("en")
      process.env.LANG = "zh_CN.UTF-8"
      expect(resolveLanguage("auto", {}, null)).toBe("zh-CN")
    })
  })
})
