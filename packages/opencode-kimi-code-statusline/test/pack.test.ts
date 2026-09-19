// Packaging smoke test: pack the package, install it with production
// dependencies only, and import the published entries. See `core/src/pack.ts`
// for what this catches and why.
import { resolve } from "node:path"
import { expect, test } from "bun:test"
import { checkPackedPackage } from "core/pack"

const PACKAGE_ROOT = resolve(import.meta.dir, "..")
const PACKAGE_NAME = "opencode-kimi-code-statusline"

test(
  "the packed tarball ships, installs, and exposes its entries",
  async () => {
    const { files } = await checkPackedPackage({
      packageDir: PACKAGE_ROOT,
      entries: ["dist/index.js", "dist/rpc.js", "dist/tui.js"],
      imports: [PACKAGE_NAME, `${PACKAGE_NAME}/rpc`],
    })
    expect(files).toContain("package/package.json")
  },
  360_000,
)
