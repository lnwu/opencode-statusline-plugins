---
name: Release
description: Cut a release of one or more packages in this monorepo — promote the bilingual changelogs, bump the versions, merge the release PR, tag main, create the GitHub releases, and verify the npm publishes. Use when the user asks to release, ship, or publish a package (发布 / 发版).
---

# Release a package

One release = one changelog section = one GitHub release. The changelog is the
source of truth for the release body; `publish.yml` publishes to npm when the
release is published. Invariants live in `AGENTS.md` → Release / Conventions.

One release PR can carry several packages: promote each package's changelog and
bump each version in a single commit, then tag every package on the same merge
commit. Each package still gets its own tag and GitHub release.

## 0. Decide the release

1. Confirm the package(s) (`packages/<pkg>/`) and read `## Unreleased` in both
   `CHANGELOG.md` and `CHANGELOG.zh-CN.md` — those entries are what ships.
2. Propose the version for every package and get explicit approval before
   changing files:
   - pre-1.0: breaking changes or features → minor; fixes only → patch
   - 1.0+: breaking → major; features → minor; fixes → patch
   - nothing user-visible under `## Unreleased` (the placeholder counts as
     nothing; package README updates count as user-visible) → ask whether to
     release at all; if yes, use a notice instead of change groups (see 0.1.6)
3. Use the tag form `<package>@<version>`, e.g. `opencode-go-statusline@0.2.1`.

## 1. Prepare the release PR

`main` is PR-only, so the release commit goes through a pull request.

```sh
git switch main && git pull
git switch -c release/<pkg>-<version>
```

For several packages, use one combined branch (e.g.
`release/<pkg-1>-<v1>-<pkg-2>-<v2>`, or the date).

In **both** language files of every package in the release:

- Rename `## Unreleased` to `## <version> - <YYYY-MM-DD>` (`date +%F`).
- Add a fresh `## Unreleased` at the top of the version list with the
  placeholder line (`_None yet._` / `_暂无变更。_`); the first entry replaces
  the placeholder.
- Do not add link-reference footers: `release-notes.ts` computes the compare
  and changelog links when it prints the release body.

Bump `version` in each `packages/<pkg>/package.json` (hand-edit, or
`bun pm version <version> --no-git-tag-version` from each package directory).
Then run `bun install` and include `bun.lock` in the release commit if its
workspace version entry changed — only `bun install` syncs it, `bun pm version`
does not (oven-sh/bun#28935).

First release of a package with no changelog yet: create the pair (English +
`.zh-CN.md`) with the first version entry, following
`packages/opencode-go-statusline/CHANGELOG.md` as the template.

A package that does not exist on npm yet cannot have a trusted publisher
configured (npm requires the package to exist), so OIDC cannot publish the
initial version. Run the one-time bootstrap in `reference/first-release.md`
once first — it checks the npm login, publishes the `0.0.0` placeholder, and
configures the trusted publisher, driving npm's interactive 2FA and handing the
auth links to the user — then continue here. Do not repeat the bootstrap on
later releases.

## 2. Verify locally

```sh
bun run changelog:check
bun run typecheck
```

`bun run test` only when `OPENCODE_API_KEY` is set — CI runs the integration
tests on the PR with the repository secret.

## 3. Land the release PR

```sh
git add packages/<pkg> bun.lock                  # repeat for every package
git commit -m "Release <pkg-1> <v1>[, <pkg-2> <v2> ...]"
git push -u origin HEAD
gh pr create --title "Release <pkg-1> <v1>[, <pkg-2> <v2> ...]" --body "<what ships>"
gh pr checks --watch
```

Ask the user to merge, or run `gh pr merge --squash` only with explicit
approval. Then `git switch main && git pull` and confirm every version landed:
`node -p "require('./packages/<pkg>/package.json').version"` must equal
`<version>`.

## 4. Tag and create the release

```sh
git tag -a "<pkg>@<version>" -m "<pkg> <version>"
git push origin "<pkg>@<version>"

bun scripts/release-notes.ts <pkg>@<version> | less   # review the body
bun scripts/release-notes.ts <pkg>@<version> | gh release create "<pkg>@<version>" \
  --title "<pkg> <version>" --verify-tag -F -
```

The body must contain the English section, the collapsed Chinese section, and
the compare + changelog links — exactly what the script prints. Repeat for
every package; in a multi-package release, every tag points at the same merge
commit. The published release event triggers `publish.yml`.

## 5. Verify the npm publish

```sh
gh run list --workflow publish.yml --limit 5   # one run per released package
gh run watch <run-id>
```

The workflow is the verification bar: the run is green and its Publish log
prints `+ <pkg>@<version>` with a signed provenance statement. A freshly
published version can 404 on the registry for a few minutes — npm processes
the upload — so don't wait for `npm view <pkg>@<version>` and don't treat a
404 right after a green run as a failure. Report the release URL and the
version; check the registry only on request or when the run looks wrong.

## Never

- Never run `npm publish` locally.
- Never create the release from a workflow or with a `GITHUB_TOKEN` actor:
  token-created release events do not trigger `publish.yml`, so npm silently
  stays behind. The maintainer's `gh release create` is intentional.
- Never tag before the release PR is merged, and never tag a commit that is
  not on `main`.
- Never use `bun pm version` / `npm version` without `--no-git-tag-version`:
  the default cuts a commit and tag during the bump, before the release PR is
  merged.
- Never update only one language file; `bun run changelog:check` fails CI.
- Never list internal-only changes (CI, tests, dependency bumps, internal
  docs); entries are curated — see `AGENTS.md` → Conventions.

## If something fails

- `changelog:check` fails → the two files drifted, or the version was not
  promoted; fix and amend the release PR.
- `gh release create` fails because the tag does not exist → push the tag
  first; `--verify-tag` guards against accidentally creating a tag from main.
- `publish.yml` fails → read the run log. The workflow refuses to publish if
  the version already exists on npm. Fix forward and re-run; if the released
  version itself is wrong, delete the release and tag
  (`gh release delete <tag>` and `git push --delete origin <tag>`) and redo
  from step 1.
