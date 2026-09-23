# Continuous Integration and Releases

## Supported Versions

The primary development and live-test runtime is Node.js 22.22.0. Static CI
also tests Node.js 24.19.0. Odd-numbered Node.js releases, including Node.js
23, are not supported targets.

Run `nvm use` from the repository root to select the version in `.nvmrc`. If
`nvm current` reports `system`, nvm has not selected the repository version.

The integration harness reads the exact n8n and `@n8n/cli` versions from
`.n8n-version` and `.n8n-cli-version`.

## Documentation Distribution

This runbook, `CONTRIBUTING.md`, and `AGENTS.md` are repository-maintainer
documents. They are intentionally excluded from the npm package by the
`package.json` `files` allowlist. Do not add them to the published tarball.

The root `README.md` is included automatically by npm and is the package-user
document shown on the npm registry. Links from that README to maintainer
documents must use absolute GitHub URLs so they remain valid after packaging.
Put installation, authentication, operation, and support guidance needed by
package users in the README; keep CI credentials and release administration in
this repository-only runbook.

## CI Triggers and Trust Policy

The CI workflow runs static checks on:

- Every pull request
- Every push to `develop`
- Every manual workflow dispatch

Static checks run lint, build, and Vitest on Node.js 22.22.0 and 24.19.0.

Every GitHub Action is pinned to a full commit SHA, with its release tag kept in
an inline comment for readability. Dependabot checks action updates monthly;
review the upstream release and resolved commit before merging an update.

Live pdfRest checks run after static checks on:

- Pull requests whose source branch is in this repository, except Dependabot
- Pushes to `develop`
- Manual workflow dispatches

Public fork and Dependabot pull requests receive static checks only and do not
receive the pdfRest credential. Their workflow summary explains why the live job
was not eligible. Maintainers review accepted changes before applying them
through an upstream branch. Do not change this workflow to `pull_request_target`.

This is a trust boundary, not just a GitHub limitation. A pull request can
change node code, tests, package scripts, dependencies, workflow definitions,
and integration scripts. Any of that code can read and disclose a credential
once the credential is present on its runner. Fork code is therefore never run
with the pdfRest credential. The `pdfrest-live` environment provides a second
gate for same-repository branches: its reviewer approves the exact commit
before GitHub releases the environment secret.

Changing a pull request's base branch does not change where its head branch is
hosted. A fork pull request remains ineligible for live tests even when it
targets a temporary branch in this repository. Public repositories cannot
prevent people from forking or proposing pull requests, so this policy treats
those requests as untrusted and keeps the credential boundary intact. Public
visibility does not grant permission to create or push branches in this
repository; only repository collaborators with write access can do that.

## Maintainer Development Flow

Use this single-pull-request flow for work by authorized maintainers:

1. Work locally in a personal fork if desired. A maintainer may push work in
   progress to that fork, but does not open a fork pull request for the normal
   maintainer workflow.
2. When the change is ready for review, push the local commit directly to a
   temporary branch in this repository. For example:

   ```bash
   git push upstream HEAD:refs/heads/pdfcloud-6122-n8n-node
   ```

   Use a lowercase, kebab-case `<jira-key>-<summary>` name for every temporary
   branch. Omit the Jira key when there is none.
3. Open one pull request from the temporary same-repository branch to
   `develop`. The CI workflow starts automatically. After static checks pass,
   the live job waits for the `pdfrest-live` environment reviewer.
4. The independent reviewer verifies the exact head commit, then approves or
   rejects the live job. Merge to `develop`
   only after the live test passes.
5. Delete the temporary branch after merge.

External changes are reviewed without secrets. For an accepted change, a
maintainer reimplements or selectively applies the reviewed work through the
maintainer flow above. This keeps the only code that can request live-test
approval on a branch controlled by repository collaborators.

Temporary feature branches normally do not need branch protection. Access to
create or update them is already limited to repository collaborators, and the
`pdfrest-live` environment approval is the credential gate. Protect long-lived
branches such as `develop` and any release branch. Review the exact head commit
again before approving a live job because a later push creates new code that
could access the credential.

## GitHub Configuration

Create a GitHub environment named `pdfrest-live` with this secret:

- `PDFREST_API_KEY`: API key for the dedicated pdfRest CI account

Protect `pdfrest-live` with required reviewers, enable **Prevent self-review**,
and disable administrator bypass. Before approving a live job, review the exact
commit for changes to GitHub Actions workflows, integration scripts, package
scripts and lockfiles, node code, and n8n workflow definitions. The job cannot
start or receive the environment secret until an independent reviewer approves
it.

The account should have enough quota for both all-endpoint workflows on every
same-repository pull request, `develop` push, manual run, and release.
Monitor usage in pdfRest and rotate the key through the GitHub environment
rather than changing repository files.

The environment accepts these optional variables:

- `PDFREST_BASE_URL`: pdfRest API base URL; defaults to
  `https://api.pdfrest.com`
- `PDFREST_TEST_PDF_URL`: URL-upload fixture for the general PDF
- `PDFREST_TEST_REDACTION_PDF_URL`: URL-upload fixture for the redaction PDF
- `PDFREST_TEST_IMAGE_URL`: URL-upload fixture for the image

The committed public URLs remain the defaults until controlled URL hosting is
introduced. Changing a variable replaces only the corresponding known URL in
the temporary workflow copy.

## Live-Test Bootstrap

CI installs the pinned n8n and `@n8n/cli` toolchain in a separate step before
the `pdfrest-live` environment credential is injected. The credential-bearing
step receives that preinstalled toolchain and invokes
`scripts/integration/run-live-tests.sh` directly, so the CI path does not run
package installation or package-manager lifecycle hooks with the credential.
The local `npm run test:integration:live` command installs the same pinned tools
when no preinstalled tools directory is configured, with `PDFREST_API_KEY`
removed from the installer environment.

The live harness builds all n8n state from scratch on each run:

1. Use the pinned n8n and `@n8n/cli` versions from a temporary directory.
2. Start n8n on localhost with an isolated SQLite database, encryption key,
   and environment-managed owner.
3. Authenticate the owner, create a short-lived n8n API key, and create the
   `pdfRestApi` credential through `@n8n/cli`.
   Use the owner session to call n8n's `/rest/credentials/test` endpoint for
   that credential. Require `data.status` to be `OK`, proving n8n discovers and
   executes the credential-level `GET /up` test before endpoint workflows run.
   This request has a 60-second timeout and no retries. A transport failure,
   malformed response, or non-OK test result fails the harness immediately.
   Credential-test payloads and raw responses stay in the secret-bearing
   runtime directory and are deleted by the cleanup trap; only a fixed safe
   pass/fail message reaches Actions output.
4. Copy the committed fixtures and generate a one-day signing certificate,
   PFX file, and random password in the temporary copy.
5. Render temporary workflows with the new credential ID, absolute fixture
   path, configured URL fixtures, and debug request diagnostics enabled.
6. Create both workflows with `@n8n/cli --file`, stop the server, and execute
   each workflow with `n8n execute --id`.
7. Delete the database, credentials, API key, rendered workflows, and generated
   signing material through the cleanup trap.

Credential IDs in committed workflow exports are n8n instance-specific. They
are never expected to match CI. The renderer replaces every `pdfRestApi`
credential reference structurally in a temporary copy and fails if the
workflow schema, file paths, or URLs are unexpected.

Every live job writes a Markdown result to the GitHub Actions job summary. It
lists both workflows, their completion status, and an allowlisted diagnostic
record for each extracted failure: node, item index, HTTP status, safe error
classification, and value-free field metadata. Free-form error messages,
response bodies, request context, and causes are excluded because they may
contain authenticated headers or customer-controlled values.

Request diagnostics are disabled during ordinary node execution. The renderer
enables them only in the temporary CI workflow copies, where n8n's debug logger
emits a value-free manifest for correlation by node name and item index. The
manifest uses the fixed operation identifier instead of the request URL and may
describe body, query, header, and binary fields by type, MIME type, and byte
count. It never includes field values, filenames, file contents, passphrases,
resource IDs, asynchronous request IDs, URLs, or credential values.

Raw n8n server, CLI, and workflow execution logs remain in the runner's
temporary diagnostics directory. The harness never prints raw execution output
to the Actions log. The summary step parses the raw files locally, writes a
separate sanitized `diagnostics.json`, and both CI workflows upload that file by
its exact path for five days on failure. Each artifact error record contains
only node, item index, HTTP status, safe classification, and value-free field
metadata. The workflows never upload the raw diagnostics directory.
Secret-bearing bootstrap files remain outside both diagnostics locations and
are deleted before the job exits.

The harness does not automatically retry pdfRest operation failures. Many
operations consume quota or are not safely idempotent, so three blanket retries
could multiply cost or side effects. Local owner/API-key requests have a
15-second timeout, n8n readiness has a 60-second deadline, and the GitHub live
job has a 45-minute timeout. The current asynchronous OCR branch verifies that
the start and status endpoints accept requests; it does not poll until OCR
completion.

To run the same harness locally:

```bash
nvm use
npm ci
npm run build
PDFREST_API_KEY='<dedicated-test-key>' npm run test:integration:live
```

Optional environment variables use the same names as the GitHub variables.
Never commit a key, generated PFX file, or generated password.

## Stable Releases

Publishing has one trigger: publishing a GitHub Release (`release: published`)
with a stable `vMAJOR.MINOR.PATCH` tag. Drafts and tag pushes alone do not publish
to npm. The workflow rejects releases marked as prereleases, tags with
prerelease/build suffixes or leading zeros, and tags that differ from the
workflow ref. Use the tag name, not the release title, to select the version.

The tag is the release version source of truth. For example, `v1.1.2` produces
npm version `1.1.2` regardless of the version committed in the source manifests.
Each static, live, and publishing job runs
`npm version "$PACKAGE_VERSION" --no-git-tag-version --ignore-scripts --allow-same-version`
in its temporary checkout before installing dependencies. This updates
`package.json`, `package-lock.json`, and the lockfile's root package version
without running lifecycle scripts or creating commits or tags. Builds regenerate
distribution metadata from that version. No version changes are pushed back.
Static and live gates test the derived version before publishing; provenance
still identifies the tagged source commit and release workflow.

Create a GitHub environment named `npm-production`. A required reviewer is
recommended.

Configure npm trusted publishing for:

- GitHub organization or user: the owner of this repository
- Repository: `n8n-nodes-pdfrest`
- Workflow filename: `publish.yml`
- Environment: `npm-production`
- Allowed action: `npm publish`

The publish job uses a GitHub-hosted runner, npm 11.19.0, and `id-token: write`
to authenticate exclusively through OIDC trusted publishing. Do not configure
an npm publishing token or OTP in GitHub. The n8n node CLI publishes with
provenance and the public access configured in `package.json`.

After publication succeeds, the separate `verify-published` job waits for up
to 20 minutes for the exact package manifest, provenance attestation, and
downloadable tarball to become available from npm. It retries only transient
registry availability failures (HTTP 404, 429, and 5xx responses, plus
transport timeouts), then verifies the exact published version. This polling
does not retry any pdfRest operation or publish action. The job has a
35-minute deadline, read-only repository permission, and no publishing
environment or OIDC permission. If the package does not become fully
available, rerun only the failed verification job once the registry is ready,
without republishing.

Verification checks the exact version's Sigstore provenance using the verifier
bundled with pinned npm 11.19.0. It requires a valid signature with the GitHub
Actions issuer and the release workflow identity, then matches the attested
package name/version and SHA-512 digest to npm metadata and checks the source
repository, release tag, workflow path, and checked-out commit. Missing,
unsupported, invalid, or mismatched provenance fails the job. The pinned n8n
community scanner then checks that exact version; both checks must pass.

If verification fails after publication succeeds, rerun only the failed
`verify-published` job (or use GitHub's re-run failed jobs option). Do not rerun
all jobs: npm publication is already complete and the version cannot be
republished. Investigate a provenance mismatch before declaring the release
ready for n8n verification; do not bypass the check.

Before creating a release tag, both parts of the release ownership gate must be
confirmed:

- The npm organization owner has granted the designated release maintainer the
  required organization access and configured the npm trusted publisher.
- The designated release maintainer has configured and tested the GitHub
  Actions publishing automation.

Missing npm ownership, trusted-publisher configuration, GitHub environment
permissions, or provenance is a release blocker. Do not add a token fallback or
publish from a developer machine.

Merge the reviewed changes and wait for CI to pass. In GitHub, create a release
using a new, unused `vMAJOR.MINOR.PATCH` tag at that exact commit, leave the
prerelease option unchecked, and publish the release. An existing tag at the
intended commit may also be selected. Ensure that commit contains the updated
release workflow; releases using older workflow revisions retain their old
behavior. No dedicated version-bump PR is needed.

Approve the protected live and npm environments when requested. Creating the
GitHub Release starts verification and publishing; it does not mean npm
publication has already succeeded. Check the Publish workflow result.

The community package scan is a post-publication release check. It scans the
published npm package, not the local worktree or PR branch, so do not use it as
a PR validation gate or evidence for unpublished changes. PR validation uses
build, lint, unit/API-contract tests, and applicable CI checks.

After GitHub Actions publishes the release, the scan must pass against that
exact version before it is declared ready for n8n verification. The publish
workflow performs this check automatically. To repeat it manually, use Node.js
22.22.0 and the same pinned scanner version as the publish workflow:

```bash
PACKAGE_VERSION=0.2.0 # Replace with the exact published release version
npx --yes @n8n/scan-community-package@0.32.0 "@pdfrest/n8n-nodes-pdfrest@$PACKAGE_VERSION"
```

Omitting the package version scans npm's `latest` version, which may not be the
intended release. A scanner installation failure is a tooling failure, not a
completed package scan, and must not be reported as a passing scan.

## Versioning Policy

Use semantic versions and keep feature or fix pull requests independent of the
package version. Select the release contents first, then choose the next unused
version in the GitHub Release tag. Committed manifest versions are development
metadata and are not required to match the release tag.

Before `1.0.0`:

- Increment the patch version for backward-compatible fixes and documentation
  corrections that affect the package.
- Increment the minor version for backward-compatible operations or features.
- Increment the minor version for breaking changes, and call them out clearly
  in release notes. The `0.x` line does not promise a stable public API.

At and after `1.0.0`, increment patch for backward-compatible fixes, minor for
backward-compatible functionality, and major for breaking changes. Published
npm versions are immutable; never reuse a version. The stable release tag must
be exactly `vMAJOR.MINOR.PATCH`; the workflow applies its version to the
temporary package manifests.

The current publish workflow accepts stable tags only. Do not publish alpha,
beta, or release-candidate versions unless a separately reviewed change adds a
documented prerelease workflow and npm dist-tag policy.
