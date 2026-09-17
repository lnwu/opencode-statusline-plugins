// Release-notes helper for the per-package changelogs.
//
// GitHub Releases cannot include a repository file, so the release body is
// generated from the changelog instead of being written twice. The package's
// `CHANGELOG.md` stays the single source of truth: sections are
// `## <version> - YYYY-MM-DD`, latest first, with `## Unreleased` on top, and
// no link-reference footer (the compare and file links are computed here).
//
// Usage:
//   bun scripts/release-notes.ts <package>@<version>  # print the release body
//   bun scripts/release-notes.ts --check              # validate the changelogs
//
// `--check` runs in CI. Per package it verifies that both language files
// exist, list the same section headings in the same order (starting with
// `## Unreleased`), use the heading format, have no empty released sections,
// and cover the `package.json` version. Packages without a `CHANGELOG.md`
// (README-only, planned) are skipped, so creating the file opts a package
// into validation.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const PACKAGES = join(ROOT, "packages")
const REPO = "https://github.com/lnwu/opencode-statusline-plugins"
const USAGE = "usage: bun scripts/release-notes.ts <package>@<version> | --check"

const HEADING = /^## (.+)$/
const DATED = /^(.+?)\s+-\s+(\d{4}-\d{2}-\d{2})$/
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
// Defensive: a stray link-reference definition must not leak into a body.
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s+\S/

interface Section {
  label: string
  /** Parsed version, or `null` for `## Unreleased`. */
  version: string | null
  body: string
}

function parseSections(path: string): Section[] {
  const sections: Section[] = []
  let current: { label: string; version: string | null; lines: string[] } | null = null
  const flush = () => {
    if (current) sections.push({ ...current, body: current.lines.join("\n").trim() })
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = HEADING.exec(line)
    if (match) {
      flush()
      const label = match[1]!.trim()
      const version = label === "Unreleased" ? null : (DATED.exec(label)?.[1] ?? label)
      current = { label, version, lines: [] }
    } else if (current && !LINK_DEFINITION.test(line)) {
      current.lines.push(line)
    }
  }
  flush()
  return sections
}

function changelogPath(pkg: string, locale: "en" | "zh"): string {
  return join(PACKAGES, pkg, locale === "en" ? "CHANGELOG.md" : "CHANGELOG.zh-CN.md")
}

function listPackages(): string[] {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) dupes.add(value)
    seen.add(value)
  }
  return [...dupes]
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function check(): void {
  const errors: string[] = []
  const skipped: string[] = []
  let checked = 0

  for (const pkg of listPackages()) {
    if (!existsSync(changelogPath(pkg, "en"))) {
      skipped.push(pkg) // README-only packages do not ship releases yet
      continue
    }
    checked++

    if (!existsSync(changelogPath(pkg, "zh"))) {
      errors.push(`${pkg}: CHANGELOG.md exists but CHANGELOG.zh-CN.md is missing`)
      continue
    }

    const en = parseSections(changelogPath(pkg, "en"))
    const zh = parseSections(changelogPath(pkg, "zh"))
    const enLabels = en.map((section) => section.label)
    const zhLabels = zh.map((section) => section.label)

    if (enLabels.join("\n") !== zhLabels.join("\n")) {
      errors.push(
        `${pkg}: section headings differ\n` +
          `  CHANGELOG.md:       ${enLabels.join(", ") || "(none)"}\n` +
          `  CHANGELOG.zh-CN.md: ${zhLabels.join(", ") || "(none)"}`,
      )
    }
    if (enLabels[0] !== "Unreleased") {
      errors.push(`${pkg}: the first section must be "## Unreleased"`)
    }
    for (const duplicate of duplicates(enLabels)) {
      errors.push(`${pkg}: duplicate section "## ${duplicate}"`)
    }
    for (const [file, sections] of [
      ["CHANGELOG.md", en],
      ["CHANGELOG.zh-CN.md", zh],
    ] as const) {
      for (const section of sections) {
        if (section.label === "Unreleased") continue
        const dated = DATED.exec(section.label)
        const version = dated ? dated[1]! : section.label
        if (!SEMVER.test(version)) {
          errors.push(
            `${pkg}: ${file}: invalid section "## ${section.label}" (expected "## <version> - YYYY-MM-DD")`,
          )
          continue
        }
        if (!dated) {
          errors.push(`${pkg}: ${file}: "## ${section.label}" is missing the "- YYYY-MM-DD" date`)
          continue
        }
        if (section.body === "") {
          errors.push(`${pkg}: ${file}: "## ${section.label}" has an empty body`)
        }
      }
    }

    const pkgJson = join(PACKAGES, pkg, "package.json")
    if (existsSync(pkgJson)) {
      const { version } = JSON.parse(readFileSync(pkgJson, "utf8")) as { version?: string }
      const versions = en.map((section) => section.version)
      if (version && !versions.includes(version)) {
        errors.push(`${pkg}: package.json version ${version} has no "## ${version} - YYYY-MM-DD" section`)
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`)
    fail(`changelog check failed: ${errors.length} problem(s)`)
  }
  const note = skipped.length > 0 ? ` (skipped without changelog: ${skipped.join(", ")})` : ""
  console.log(`changelog check: ${checked} package(s) OK${note}`)
}

function releaseNotes(tag: string): string {
  const at = tag.lastIndexOf("@")
  if (at <= 0 || at === tag.length - 1) fail(USAGE)
  const pkg = tag.slice(0, at)
  const version = tag.slice(at + 1)
  if (!existsSync(join(PACKAGES, pkg))) fail(`unknown package "${pkg}"`)

  const enSections = parseSections(changelogPath(pkg, "en"))
  const index = enSections.findIndex((section) => section.version === version)
  if (index === -1) fail(`${pkg}: CHANGELOG.md has no "## ${version}" section`)
  const en = enSections[index]!
  const zh = parseSections(changelogPath(pkg, "zh")).find((section) => section.version === version)
  if (!zh) fail(`${pkg}: CHANGELOG.zh-CN.md has no "## ${version}" section`)
  if (!en.body) fail(`${pkg}: CHANGELOG.md: "## ${version}" has an empty body`)
  if (!zh.body) fail(`${pkg}: CHANGELOG.zh-CN.md: "## ${version}" has an empty body`)

  // The next released section below is the previous version (latest first).
  const previous = enSections
    .slice(index + 1)
    .find((section) => section.version !== null && SEMVER.test(section.version))
  const compare = previous
    ? `${REPO}/compare/${encodeURIComponent(`${pkg}@${previous.version}`)}...${encodeURIComponent(tag)}`
    : `${REPO}/commits/${encodeURIComponent(tag)}`
  const file = `${REPO}/blob/${encodeURIComponent(tag)}/packages/${pkg}/CHANGELOG.md`

  return [
    en.body,
    "",
    "<details>",
    "<summary>简体中文</summary>",
    "",
    zh.body,
    "",
    "</details>",
    "",
    `**Full Changelog**: ${compare}`,
    `**Changelog**: ${file}`,
    "",
  ].join("\n")
}

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === "--check") check()
else if (args.length === 1) process.stdout.write(releaseNotes(args[0]!))
else fail(USAGE)
