# Contributing to @pdfrest/n8n-nodes-pdfrest

Thank you for helping improve the pdfRest community node for n8n. By
participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Scope

This package is limited to the pdfRest service. Keep the implementation aligned
with n8n community-node guidance and the externally versioned
[pdfRest OpenAPI specification](https://api.pdfrest.com/pdfrest_openapi.json).
Do not add integrations for other services or external runtime dependencies.

The public node display name is `pdfRest API Toolkit`.

## Development Setup

Use Node.js 22.22.0 for development. Node.js 24.19.0 is the additional CI
compatibility target; odd-numbered Node.js releases are unsupported.

```bash
nvm use
npm ci
npm run build
```

If `nvm current` reports `system`, run `nvm use` before validating a change.
The repository pins its n8n and `@n8n/cli` integration versions separately in
`.n8n-version` and `.n8n-cli-version`.

Start the local n8n development server with:

```bash
npm run dev
```

The default development command has a limited log window. To keep the n8n
server logs visible in a separate terminal, use the following setup instead.

Terminal 1:

```bash
npm run dev -- --external-n8n
```

Terminal 2:

```bash
N8N_USER_FOLDER="$HOME/.n8n-node-cli" \
N8N_DEV_RELOAD=true \
npx n8n@latest
```

## Implementation Expectations

- Prefer n8n's declarative node style when it supports the operation.
- Use n8n's built-in HTTP helpers. Do not add `axios`, `node-fetch`,
  `form-data`, or another runtime HTTP or multipart dependency.
- Do not read environment variables or the local file system from node or
  credential code.
- Keep credentials, node registrations, package metadata, tests, and
  documentation synchronized.
- Preserve the established pdfRest product language and parameter layout.
- Keep the operation-only node layout. All pdfRest operations belong in one
  searchable Operation selector rather than separate Resource menus.
- Add Vitest coverage for helpers, operation descriptors, and request shaping.
- Keep quota-consuming live checks separate from unit and contract tests.

The detailed implementation and UI invariants are recorded in
[AGENTS.md](AGENTS.md). They apply to human-authored and agent-assisted changes.

## Validation

Run the static validation suite before opening a pull request:

```bash
npm run lint
npm run build
npm test
```

The lint command must complete without warnings or errors.

Live integration tests require the dedicated pdfRest test account and consume
API quota:

```bash
PDFREST_API_KEY='<dedicated-test-key>' npm run test:integration:live
```

Do not use a personal API key. The harness creates isolated n8n state and
temporary credentials, workflows, fixtures, and signing material. See the
[CI and release runbook](docs/ci.md) for optional URL and base-URL variables.

The community package scan is a post-publication release check, not a PR
validation gate. It scans the package available in npm and cannot validate
unpublished changes. After GitHub Actions publishes a release, require a passing
scan of that exact version before declaring it ready for n8n verification. See
the [CI and release runbook](docs/ci.md) for the pinned command.

## Workflow Fixtures

Workflow JSON under `test/workflows/` must remain valid input for strict
`n8n-cli workflow update` requests. Preserve node IDs, parameters, credentials,
and connections while removing API response metadata.

After editing a workflow file:

1. Run the repository's `sanitize-n8n-workflow-export` skill or its checker.
2. Confirm the top-level keys with `jq 'keys'`.
3. Render a temporary copy rather than committing machine-specific credential
   IDs, absolute paths, generated certificates, or secrets.
4. Preserve the completion and error-aggregation barrier described in
   [AGENTS.md](AGENTS.md).

Committed test PDFs and images are stable fixtures. Do not rewrite them as an
incidental part of another change. Generated PFX and password files must never
be committed.

## Pull Requests and Commits

Keep commits small enough to review independently. A useful commit should
represent one coherent outcome, include its tests or documentation, and leave
the repository in a valid state.

Authorized maintainers may work in personal forks, but the pull request that
is intended to merge must originate from a temporary branch in this repository.
Push the local commit ready for review directly to that branch, then open a
pull request to `develop`. Do not continuously mirror work in progress from a
personal fork.
See the [CI and release runbook](docs/ci.md#maintainer-development-flow) for
the trust rationale and exact flow.

Pull requests from forks may receive static checks, but never receive the
pdfRest credential or live-test access. A maintainer reviews accepted changes
and applies them through the maintainer flow when they are ready for live
validation.
Public visibility permits cloning, forking, and fork pull requests; it does not
grant permission to create or push branches in `pdfrest/n8n-nodes-pdfrest`.

Use lowercase, kebab-case `<jira-key>-<summary>` names for all temporary
repository branches. For example, use `pdfcloud-6122-n8n-node`. Omit the Jira
key when no work item exists. Branch names are public repository metadata, so
never put credentials, customer data, or other confidential information in them.
Temporary branches normally do not need branch protection. Protect
long-lived integration and release branches and use the `pdfrest-live`
environment approval as the credential gate. Only repository collaborators with
write access can create or update upstream temporary branches.

Pull requests should explain the motivation, behavior changes, validation,
risks, and follow-up work. Call out changes that consume more pdfRest quota,
alter workflow fixtures, affect credentials, or change release behavior.

Preserve unrelated worktree changes and do not commit generated `dist` output.

## Releases

Never publish from a developer machine. Stable releases are performed only by
GitHub Actions with npm provenance after static and live gates pass. Do not add
a personal-token fallback.

Feature and fix pull requests do not change the package version. Prepare the
SemVer change in a dedicated release pull request after selecting the release
contents; update both `package.json` and `package-lock.json`. The current
`0.1.1` version is the next patch release. See the
[versioning policy](docs/ci.md#versioning-policy) for later releases.

Release ownership, npm trusted publishing, environment setup, and tag
conventions are documented in the [CI and release runbook](docs/ci.md).
