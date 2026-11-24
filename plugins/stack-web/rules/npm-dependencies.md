# npm dependencies (shared by the npm stack plugins)

- Pick versions published at least 14 days ago (`npm view <pkg> time --json`). The project's Dependabot uses the same cooldown, and `upgrade-deps` checks it. One exception: a patch release of the same line from the official publisher that fixes a finding the security gate blocks may be taken at once; say which finding in the pull request (ADR-0009).
- Commit the lockfile. CI installs with `npm ci`, never `npm install`.
- Do not add a dependency for what the platform already does: `fetch`, `crypto.randomUUID`, `structuredClone`, `node:test`.
- Keep `typescript` on 6.0.x. TypeScript 7 is the native compiler and ships no `tsserver` or JS API, and the tools built on them (`typescript-eslint` supports `<6.1.0`, `vue-tsc`, `typescript-language-server`) do not run on it yet. Check each tool's `peerDependencies` before a major TypeScript upgrade.
- TypeScript 6 no longer loads `@types/*` packages on its own: list them in `compilerOptions.types` (for example `["node", "jest"]`), or globals such as `describe` and `process` are missing.

## Install scripts (`allowScripts`, npm 11)

`allowScripts` in the root `package.json` records which dependencies may run `preinstall`, `install` or `postinstall`. In npm 11.17 it is advisory: unreviewed scripts still run and the install prints a notice. A later npm release blocks them by default, and `strict-allow-scripts=true` in `.npmrc` blocks them today.

- After adding a dependency that has an install script, read what the script does. Then run `npm approve-scripts <pkg>` at the workspace root (it writes a version-pinned entry), or `npm deny-scripts <pkg>` when the package works without it.
- `npm approve-scripts --allow-scripts-pending` lists what is not reviewed yet. Never use `--all` or `--dangerously-allow-all-scripts` to make the notice go away.
- A denied package that needs its script (native binaries such as `esbuild`, `sharp`, `@parcel/watcher`) fails when it is used, not when it is installed.
- Node 22 ships npm 10, which ignores `allowScripts`. The entries still record the review and take effect when the toolchain moves to npm 11.
