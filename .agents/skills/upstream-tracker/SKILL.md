---
name: Upstream tracker
description: Check the workaround-tracking issues labeled `upstream` for upstream progress and report which ones are ready to unwind. Use when the user asks to check for upstream updates (检查上游问题有没有更新 / 上游 issue 有没有更新).
---

# Track upstream workarounds

Every upstream workaround lands with a tracking issue labeled `upstream`
(convention in `AGENTS.md` → Conventions → "Upstream bugs and limitations").
The issue body carries the upstream link, the local workaround, and its
"Done when" unwinding steps. A check covers **only** issues with that label —
never scan the full issue list.

## 1. List the tracked issues

```sh
gh issue list --label upstream --state open
```

## 2. Check each issue's upstream target

Read the issue body, then follow its link(s) to the source of truth:

- Upstream issue — state and latest comments:
  `gh issue view <n> --repo <owner/repo> --json state,updatedAt,comments`
- Upstream PR named in the body (a report can have a fix in flight):
  `gh pr view <n> --repo <owner/repo> --json state,mergedAt`
- Release watches (targets waiting on the next upstream release):
  `gh release list --repo <owner/repo> --limit 5`, plus `npm view <pkg>
  version` for npm packages.

## 3. Report

For each issue:

- the number and title;
- the upstream state: no change / progress (say what changed) / fixed;
- whether the "Done when" condition is met, and if so the next action.

A check is read-only: do not close issues, remove labels, or touch the
workaround during the sweep. Unwinding a workaround is a separate change
(usually a PR) that follows the issue's "Done when" steps.
