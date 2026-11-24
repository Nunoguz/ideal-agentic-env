---
name: setup
description: Install or update the governance layer in the current project. Scaffolds the compliance and security records (docs/compliance, docs/security) and the Law-layer CI (security scans, dependency gate, personal-data compliance gate, change-audit, Dependabot). Records are never overwritten; managed CI files update with --refresh. Use only when the user runs /governance:setup or explicitly asks to set up or update governance or compliance.
disable-model-invocation: true
argument-hint: "[--refresh] [--adopt a,b] [--parts docs,ci] [--default-branch main]"
---

# Set up governance

`scripts/setup.mjs` in this skill's directory does the file work deterministically.

- **Project files** (`docs/`, `.github/dependabot.yml`) are created once and never overwritten.
- **Managed files** (`.github/scripts/*`, `.github/workflows/*`) carry a `Managed by governance <version>` marker with a hash. `--refresh` updates a managed file only while its body still matches that hash. A file someone edited by hand is skipped.
- **The dependency policy** goes into `.claude/ideal-agentic-env.json` under `governance`, add-only: `licenses.allow` (the license allowlist, a legal decision) and `vulnerabilities.blockAtOrAbove` (CVSS score that fails the gate, 7.0 by default).

## 1. Dry run

Run `node "<this skill's directory>/scripts/setup.mjs" --target . --dry-run`. Pass on any `--refresh`, `--parts` or `--default-branch` the user gave. Show the user every `create`, `update`, `merge` and `skip` line and the detected default branch, then ask them to confirm.

Updating an existing installation (after a plugin upgrade): add `--refresh`. For each `skip` line that says a file is edited by hand or has no marker:
1. Show the difference: `node "<this skill's directory>/scripts/setup.mjs" --target . --print <path>` prints what setup would write. Compare it with the project's file.
2. Ask the user whether to replace the file. Only on their yes, add that path to `--adopt a,b`. Never adopt a file without asking: it may hold a local fix.

The script writes the files itself, so the core edit hooks do not prompt for them even though `.github/` is a protected path. The dry-run list and the user's confirmation are the review.

## 2. Apply

Run the same command without `--dry-run`. A `merge` of `.claude/ideal-agentic-env.json` that says `moved from security.yml` carries the project's existing license allowlist over unchanged.

## 3. Explain what now runs in CI

- **`security`:** gitleaks (secrets in git history), Semgrep CE (SAST; on PRs only new findings fail), the dependency gate and Syft (an SBOM artifact on the default branch). Every tool is pinned by version and sha256.
- **The dependency gate** (`.github/scripts/dependency-gate.mjs`, OSV-Scanner underneath) fails on vulnerabilities at or above `blockAtOrAbove` (CVSS 7.0, High), on malicious packages (`MAL-*`), on findings without a severity, and on licenses outside the allowlist. Lower severities only appear in the job summary, and the weekly run keeps one `[vulnerability-report]` issue listing them. First-party packages (npm workspace members) are skipped by the license check automatically.
- **`compliance`:** the personal-data gate. A PR that adds personal-data-looking fields to schema files fails unless `docs/compliance/data-inventory.md` changes or the author attests in the PR description. It writes a compliance report to the job summary.
- **`change-audit`:** after every push to the default branch, it checks that each commit came from a merged PR with green checks. Otherwise it fails and opens a `[change-control]` issue. Where the plan has no branch protection, this is the main change-management control.

## 4. First run in an existing codebase

A PR that adds or changes `security.yml` or a scanner exception file scans the whole repository and its history. Other PRs report only new findings. So the PR that installs governance shows the existing findings before merge. Triage them with the user in that PR, and never by switching a check off:

- **Secrets:** rotate the secret first. Then add the finding's fingerprint to `.gitleaksignore`, with a comment naming the rotation.
- **Semgrep:** fix the finding. If it is a false positive, add `// nosemgrep: <rule-id>` with the reason on the same line.
- **Vulnerabilities and licenses:** upgrade the dependency. If you cannot, propose an exception in `osv-scanner.toml`: `[[IgnoredVulns]]` with `ignoreUntil`, or `[[PackageOverrides]]` with `license.ignore = true` and `effectiveUntil`, each with a `reason`.

Exceptions, the license allowlist and the blocking threshold are the repository owner's decisions. Present the finding and the options, and write an exception only after the owner says yes. Each exception is a reviewed change in a PR.

## 5. Settings the user changes

Ask before making any of these changes, or leave them to the user:

- Turn on Dependabot alerts for the repository: Settings → Code security, or `gh api -X PUT repos/{owner}/{repo}/vulnerability-alerts`.
- Make sure the `security`, `compliance` and `ci` checks are green before merging. Where branch protection exists, mark them as required.

## 6. Next

Fill the records in this order, each with its skill:
1. `data-inventory`
2. `retention-and-erasure`
3. `access-matrix`
4. `threat-model`
5. `control-map`, to set the owners

Records hold field names and categories only, never real personal data.
