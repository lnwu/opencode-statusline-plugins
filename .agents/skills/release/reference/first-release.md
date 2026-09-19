# First npm release bootstrap

One-time bootstrap for a package that does not exist on npm yet: npm requires
the package to exist before a trusted publisher can be configured, and the OIDC
workflow cannot create it. Do this once before the first release, then continue
with the release runbook above. No changelog entries for this work — it only
touches release tooling.

## Preflight

1. `npm view <pkg> version` — a 404 means the bootstrap is needed; any version
   means it is not (the package already exists, go straight to the release
   runbook).
2. `npm --version` — `npm trust` needs >= 11.15.0.
3. `npm whoami` — a 401 means the token in `~/.npmrc` expired. `npm login` is
   interactive and must be run by the user in their own terminal; ask them and
   continue only once `npm whoami` prints their username.

## Auth links (when npm asks for 2FA)

The npm account uses auth-and-writes 2FA, so any non-interactive `npm` command
fails with `EOTP`, and the URL is redacted (`***`) when stdout is a pipe. Drive
npm's web-auth flow instead and give the resulting link to the user:

```sh
cd <temp-dir>
printf 'y\n' | BROWSER=true script -qec "<npm command>" /tmp/<name>.log
```

- Run it in the background, then read the command's live streamed output —
  `script`'s own log file flushes only on exit. `script -qec` gives npm a
  pseudo-TTY (without one the URL never appears), `BROWSER=true` makes npm skip
  trying to open a browser and poll instead, and `printf 'y\n'` answers npm's
  `Do you want to proceed? (y/N)` prompt when there is one (omit it for plain
  `npm publish`).
- Extract the link:

  ```sh
  sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g; s/\r/\n/g' <stream-file> \
    | grep -oE 'https://www\.npmjs\.com/auth/cli/[A-Za-z0-9-]+' | tail -1
  ```

- Post the link to the user and wait; the command keeps polling and completes
  once they approve in the browser. Each attempt mints a new link — never reuse
  an old one, and do not retry while one is pending.

## Step 1 — placeholder publish

Publish a minimal `0.0.0` stub so the name exists. `--tag
trusted-publisher-claim` keeps `latest` off the stub until the real release.

```sh
mkdir -p /tmp/oc-<pkg>-stub && cd /tmp/oc-<pkg>-stub
cat > package.json <<'EOF'
{
  "name": "<pkg>",
  "version": "0.0.0",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/lnwu/opencode-statusline-plugins.git",
    "directory": "packages/<pkg>"
  }
}
EOF
```

Then `npm publish --tag trusted-publisher-claim` through the auth-link flow
above. Success prints `+ <pkg>@0.0.0`.

## Step 2 — trusted publisher

```sh
npm trust github <pkg> --repo lnwu/opencode-statusline-plugins \
  --file publish.yml --allow-publish
```

Same auth-link flow. Success prints `Trust configuration created successfully
for <pkg>` with `type: github`, `file: publish.yml`, the repository, and
`permissions: publish, stage publish`.

If `npm trust` is unavailable (npm < 11.15), configure it in the npm web UI:
package Settings → Trusted publishing → GitHub Actions, owner `lnwu`,
repository `opencode-statusline-plugins`, workflow `publish.yml`, allowed
action `npm publish` — `https://www.npmjs.com/package/<pkg>/access`.

## Then release

Continue with the release runbook above from step 1: create the changelog pair
with the first version entry, land the release PR, tag, and create the GitHub
release. OIDC publishes the real version; never publish the real package
locally.

Optional cleanup once the real version is live: deprecate the placeholder
(`npm deprecate <pkg>@0.0.0 "initial release placeholder"`) and delete the
`trusted-publisher-claim` dist-tag in the npm web UI. Both are cosmetic and
need auth again.
