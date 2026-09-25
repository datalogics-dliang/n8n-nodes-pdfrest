# pdfRest n8n Node Contributor Guide

## Project objective

Build `@pdfrest/n8n-nodes-pdfrest`, a verified n8n community node for the pdfRest
service. The target is the n8n Cloud nodes panel, not merely npm discovery.

The public node display name is `pdfRest API Toolkit`. Do not shorten it to
"pdfRest" or call it "pdfRest Node" in user-facing repository content.

## Non-negotiable verification requirements

- Keep the package name as `@pdfrest/n8n-nodes-pdfrest` (or, only if approved, use a
  scoped name matching `@scope/n8n-nodes-*`).
- Keep this package limited to pdfRest. A pdfRest trigger node may be added;
  integrations for other services may not.
- Start from and retain the conventions of the `npm create @n8n/node` scaffold.
- Write TypeScript that follows the n8n node-development guidance.
- Add no external runtime dependencies. Use n8n's built-in HTTP request
  helpers; never add `axios`, `node-fetch`, `form-data`, or similar runtime
  libraries.
- Do not access environment variables or the local file system from node or
  credential code.
- Use English for all user-visible and repository-facing content: UI copy,
  errors, help text, documentation, code comments, and commits.
- Do not duplicate an existing n8n node. Check this before expanding scope.
- After GitHub Actions publishes a release, require the community package scan
  to pass against that exact published version before declaring it ready for
  n8n verification. Follow `docs/ci.md` for the pinned scanner command.
- A scan by npm package name checks the published package, not the local
  worktree or pull request. Do not run it as a PR validation gate or report its
  result as evidence for unpublished changes.
- Never publish from a developer machine. Releases must be published by GitHub
  Actions with an npm provenance statement. Do not use `npm publish` locally.

## Release ownership gate

Before each release, confirm that:

- The repository maintainers have granted the repository workflow the required
  ownership and publishing access in the npm organization.
- The designated maintainers have configured and tested the GitHub Actions
  publishing automation.
- The workflow can obtain its required npm publishing authorization and emits
  provenance.

Treat missing npm organization ownership, repository permissions, Actions
authorization, or provenance as a release blocker. The initial `0.1.0` release
was the sole permitted bootstrap-token exception. That path is closed and must
not be restored; all subsequent releases must use OIDC trusted publishing. Do
not add a token fallback or publish locally.

## CI conventions

- Treat [`CONTRIBUTING.md`](CONTRIBUTING.md) as the human contributor entry
  point and [`docs/ci.md`](docs/ci.md) as the canonical CI and release runbook.
  Update the runbook in the same change as any behavior it describes.
- Run static CI for every pull request, every push to `develop`, and manual
  dispatches. Test Node.js 22.22.0 and 24.19.0; use Node.js 22.22.0 for live
  integration and publishing. Odd-numbered Node.js releases are unsupported.
- Pin every GitHub Action to a full commit SHA and retain its release tag in a
  comment. Review upstream changes before accepting automated SHA updates.
- Read the exact integration versions from `.n8n-version` and
  `.n8n-cli-version`. Do not silently float n8n or `@n8n/cli` in CI.
- Expose the live pdfRest credential only to same-repository pull requests
  other than Dependabot, pushes to `develop`, manual dispatches, and protected
  releases. Never use `pull_request_target` for live tests.
- Bootstrap n8n, its owner, API key, pdfRest credential, workflows, signing
  material, and SQLite state ephemerally. Replace credential IDs, fixture
  paths, and configured URL fixtures only in temporary workflow copies.
- Keep committed PDFs and images stable. Generate the signing PFX and password
  for each live run, keep them out of diagnostics, and delete secret-bearing
  state in an always-running cleanup trap.
- Keep request diagnostics disabled during ordinary node execution. Enable them
  only in temporary CI workflow copies, emit through n8n's debug logger, and
  identify requests by the fixed operation value rather than the request URL.
  Do not record filenames or dynamic resource and asynchronous request IDs.
- Keep raw n8n and live-test logs only in temporary runner storage. Never print
  raw execution output or upload a raw diagnostics directory. Generate the job
  summary through an explicit allowlist. Upload a single `diagnostics.json`
  artifact whose error records contain only node, item index, HTTP status, safe
  error classification, and value-free field metadata.
- In GitHub Actions, install the pinned live-test toolchain before the pdfRest
  credential is available. Pass that toolchain to the credential-bearing step
  and invoke the live harness directly so the CI path does not run package
  installation or package-manager lifecycle hooks with the credential.
- Do not add blanket retries to quota-consuming pdfRest operations. The harness
  uses bounded local bootstrap timeouts and the workflow/job completion
  deadline documented in `docs/ci.md`.
- Publish only when a stable GitHub Release is published with a
  `vMAJOR.MINOR.PATCH` tag. Derive the package version from that tag and apply it
  to `package.json` and `package-lock.json` in each temporary release checkout
  before installing, building, or testing. Do not commit these version changes.
  Static and live gates must pass, and the protected npm environment must
  authorize publishing with provenance. The initial `0.1.0`
  release was the only permitted bootstrap-token exception; all later releases
  must use OIDC trusted publishing. Do not add another publish trigger or a
  token fallback.

## Node implementation rules

- Prefer n8n's declarative style when it supports the pdfRest operation. Use
  imperative code only where it is genuinely necessary, such as a multipart
  request the built-in helpers cannot express.
- Flag a multipart upload limitation immediately. Do not introduce a runtime
  dependency as a workaround.
- Expose `Input File` for every operation whose OpenAPI multipart request
  schema supports a primary file upload. Keep the alternative Resource ID or
  URL branches when the specification supports them, and make `Input File`
  the default Input Source.
- Use the shared input-source descriptor factory wherever possible. Each
  eligible operation must render exactly one Input Source selector; do not add
  another selector during descriptor assembly when the operation already
  defines one. Merge inputs may each have their own nested selector because
  each entry represents a separate file.
- Preserve operation-specific request preparation before converting deferred
  binary uploads to multipart form data. This is required for operations that
  serialize structured JSON fields or remove inactive options in pre-send
  hooks.
- Treat the externally versioned pdfRest OpenAPI specification as the source
  of truth for API routes, parameters, request bodies, and responses. Use the
  documentation MCP to access it when needed; do not create or maintain a
  duplicate API contract matrix in this repository. The current source is
  https://api.pdfrest.com/pdfrest_openapi.json.
  If the specification moves behind an API, update this documented source or
  its documented discovery mechanism. Do not select the source through an
  environment variable.
- Record the OpenAPI revision reviewed for the node in the root
  `.pdfrest-openapi-version` file. Update it when reviewing a newer revision
  and describe any known unimplemented API features in the pull request. The
  recorded revision is a review baseline, not a completeness claim.
- Keep credentials, nodes, build output registrations, package metadata, and
  documentation synchronized as the starter examples are replaced.
- Use Vitest for unit and API-contract tests. Cover pure helper behavior and
  declarative operation descriptors with sanitized fixtures; keep live pdfRest
  API checks separate because they consume API quota.
- Validate pull requests with the project's build, lint, and unit/API-contract
  test scripts, plus applicable CI checks. Keep the published-package scan at
  the post-publication stage described above. Also exercise binary upload and
  output download in a local n8n workflow before release.

## UX and copy rules

### Names and grammar

- Use Title Case for node labels, parameter labels, and subtitles. Preserve the
  `pdfRest` brand casing wherever it appears.
- Use sentence case for tooltips, hints, and info boxes. A one-sentence tooltip
  or hint has no period; use a period for multiple sentences.
- Use pdfRest product language rather than API endpoint names. Pick one term
  per concept and use it consistently across every resource and operation.
- Rewrite API documentation in clear product language; do not paste API
  parameter descriptions into tooltips.

### Parameter layout

- Use a single Operation selector without a Resource selector. Keeping every
  pdfRest operation in one searchable list is an intentional product decision;
  do not split operations into resource menus.
- Show required fields initially, ordered from most important to least
  important and from broad scope to narrow scope.
- Put optional fields in an `Optional fields` section, alphabetized. Group
  them by theme when there are many.
- Use progressive disclosure: show a dependent field only after its dependency
  has a value. Bundle connected optional fields under one option when that
  option reveals both.
- For the primary file input, use `Input File Data Field Name`. For an operation
  that produces one primary output file, use `Output File Data Field Name`. If
  an operation can produce multiple output files and the configured value is a
  prefix for distinct output fields, use `Output File Data Field Name Prefix`.
  Keep the prefix unchanged for the first file and append `_1`, `_2`, and so on
  in response order for additional files. Qualify secondary or alternate file
  and resource-ID labels with the file's role, such as `Image Input File Data
  Field Name` and `Image Resource ID`. Do not use `binary data` or `binary
  property`.
- Add `Simplify Response` when an operation returns more data than most users
  need. Its description must be: `Whether to return a simplified version of
  the response instead of the raw data.`
- Toggle descriptions for boolean values begin with `Whether to`. If the false
  state would be unclear, use a named-options dropdown instead of a toggle.
- Date and timestamp values must accept every ISO 8601 format.
- JSON fields must accept typed JSON and expressions that return JSON.
- When users must identify a record, use `Name or ID` with a picker and manual
  ID entry.
- Reserve info boxes for essential information. Use hints or tooltips for
  useful but nonessential context.

## Working conventions

- Preserve unrelated user changes in the worktree.
- Do not commit generated `dist` output unless the repository's established
  release process explicitly requires it.
- Keep the README focused on pdfRest installation, authentication, operation
  behavior, and verified-node release/support information as starter content is
  removed.
- When a requirement conflicts with a scaffold default, favor the verified-node
  requirements above and document the decision in the pull request.

### n8n workflow update files

In this section, **n8n workflow definition file** means a JSON file under
`test/workflows/` that represents serialized n8n editor state and can be sent
to the n8n workflow update API. It does not mean a **GitHub Actions workflow**,
which is a YAML automation file under `.github/workflows/`. Use these qualified
terms in instructions, documentation, and filenames whenever plain "workflow
file" could refer to either kind.

Name helper files for n8n workflow definitions explicitly. For example, use
`sanitize_n8n_workflow_export.py`, not `sanitize_workflow.py`. In command
examples, use a concrete `.json` filename under `test/workflows/` rather than a
generic workflow filename that could be mistaken for a file under
`.github/workflows/`.

n8n workflow definition JSON committed under `test/workflows/` must be usable
with:

```bash
n8n-cli workflow update <id> --file=<filepath>
```

An n8n workflow export is an API response object and contains read-only fields
that the strict update endpoint rejects as additional properties. Before saving
an exported workflow in this repository, reduce its top level to only:

- `name`
- `nodes`
- `connections`
- `settings`
- `staticData`
- `nodeGroups`
- `pinData`

Remove response metadata such as `id`, `createdAt`, `updatedAt`, `active`,
`isArchived`, `meta`, `versionId`, `activeVersionId`, `versionCounter`,
`triggerCount`, `sourceWorkflowId`, `shared`, `tags`, and `activeVersion`. Also
remove a null top-level `description`. Supply the workflow ID only as the
positional argument to `n8n-cli workflow update`; do not retain it in the JSON
body. Preserve node IDs, credential references, and all node parameters because
they are part of the editable workflow definition.

Treat each node's `parameters` object as serialized n8n UI state, not as a raw
pdfRest request body. Before editing workflow parameters, compare their names
and stored option values with the current node descriptor and an established
workflow example. Use the node's product-language concepts and values, such as
`resourceId` and `inputType: "resourceId"` for the **Resource ID** UI option.
Do not substitute OpenAPI wire names or values such as `id`, `id[]`, or
`type[]` unless the node descriptor itself uses those exact serialized
parameters. Workflow edits that appear in the n8n editor must remain
consistent with the labels, choices, and progressive disclosure already
established by the node UI.

As a cleanup step after editing any JSON file under `test/workflows/`, check it
for n8n API-response metadata or other fields that the strict workflow update
schema rejects. If cleanup is needed, use the
[`sanitize-n8n-workflow-export`](.agents/skills/sanitize-n8n-workflow-export/SKILL.md)
skill before treating the workflow edit as complete. Preserve node parameters,
node IDs, credential references, and connections while sanitizing the file.

After editing or exporting a workflow, verify its top-level keys before using
the CLI. For example:

```bash
jq 'keys' test/workflows/example.json
```

To create an update payload from a newly exported workflow, write the filtered
object to a different file and then replace the repository fixture deliberately:

```bash
jq '{name, nodes, connections, settings, staticData, nodeGroups, pinData}' \
  exported-workflow.json > workflow-update.json
```

The update endpoint also validates nested objects such as `settings` strictly.
If it reports a path below `request/body`, compare that object with the public
API schema supported by the target n8n instance and remove response-only or
unsupported properties at that path.

Treat `request/body must NOT have additional properties` as a schema failure,
even if an older CLI or server appeared to apply the update despite that error.

### CI workflow error aggregation

For large verification workflows that must exercise independent branches before
reporting failures, use
`test/workflows/error-aggregation-example.json` as the minimal reference for
error shaping, merging, aggregation, and the final failure gate. Extend that
pattern as follows so the report is a reliable completion barrier. The example
includes failing and successful test branches to demonstrate that every branch
must emit a completion item while Aggregate collects only the errors.

- Configure every pdfRest node under test with **On Error** set to **Continue
  (using error output)** (`onError: "continueErrorOutput"`). Do not use
  **Continue (using regular output)** because it makes failed and successful
  items indistinguishable downstream.
- Connect each pdfRest error output directly to its own **Edit Fields** node.
  Capture the source name before any Merge node, because `$prevNode` identifies
  only the immediately preceding node. Use a JSON Output expression shaped like:

  ```javascript
  ={{ {
    error: {
      node: $prevNode.name,
      details: {
        name: $input.item.error?.name,
        message: $input.item.error?.message,
        description: $input.item.error?.description,
        httpCode: $input.item.error?.httpCode,
        responseMessage:
          typeof $input.item.error?.context?.data?.error === "string"
            ? $input.item.error.context.data.error
            : undefined,
      },
    },
  } }}
  ```

  Never aggregate the complete error `context` or `cause`; they may contain
  authenticated request headers or other sensitive request details. Temporary
  CI workflow copies enable a debug-level, value-free request manifest so the
  diagnostics sanitizer can correlate an error by node name and item index
  with body, query, header, and binary field metadata. Keep this diagnostic
  hook disabled in customer workflows. Use the fixed operation identifier,
  never the request URL, and do not include field values, filenames, file
  contents, passphrases, resource IDs, asynchronous request IDs, URLs, or
  credential values in these manifests.

- Treat error capture and synchronization as separate concerns. Every logical
  test branch must send exactly one completion item to the synchronization tree:
  either the formatted `error` item from the first failed node in that branch or
  an empty JSON item from a successful terminal path. Do not build a Merge
  barrier from error paths alone; a successful branch would produce no input and
  the final report might never run.
- For a dependent sequence such as Upload -> Encrypt -> Decrypt, allocate one
  synchronization input for the sequence, not one for every node. Route each
  node's formatted error outcome and the terminal success outcome to that same
  logical input. An upstream failure prevents downstream nodes from running, so
  separate required inputs for all three nodes would never all arrive.
- Handle shared prerequisites explicitly. If one upload or setup node feeds many
  test branches, either fail immediately when setup fails, emit a completion
  outcome for every branch it prevented from running, or give the branches
  independent setup. Never leave a shared prerequisite's error output
  unaccounted for.
- Synchronize outcomes with **Merge** nodes in **Append** mode. Set **Number of
  Inputs** to the number actually connected to that Merge node, up to the n8n
  maximum of ten. For more than ten logical branches, build a Merge tree in
  groups of at most ten; connect each child Merge output to one distinct input
  of the next Merge level. The final Merge must represent every logical branch.
- After the final Merge, use **Aggregate** in **Individual Fields** mode. Aggregate
  the input field `error`, rename the output field to `errors`, and leave **Keep
  Missing And Null Values** disabled. This produces `{ "errors": [] }` when all
  completion items represent success and excludes those success items from an
  error report. Do not use **All Item Data** for this barrier because it would
  include successful completion records in `errors`.
- Connect Aggregate to an **If** node whose condition is that the `errors` array
  length is greater than zero. Leave the false branch as the successful end of
  the verification workflow, or connect it to any explicit success reporting.
  Connect only the true branch to **Stop and Error**.
- Configure **Stop and Error** to use **Error Object** and preserve the complete
  aggregated report. Use an expression such as:

  ```javascript
  ={{ JSON.stringify({
    message: `${$json.errors.length} pdfRest operation(s) failed`,
    errors: $json.errors,
  }) }}
  ```

- Do not rely on **Always Output Data** to signal branch completion. It describes
  empty node output and can also create an empty success item after a routed
  failure. Use explicit terminal success completion items instead.
- Before using the workflow in CI, exercise an all-success run, one failure in
  each Merge group, multiple simultaneous failures across Merge groups, and a
  shared-prerequisite failure. Confirm that the workflow runs all unaffected
  branches, produces one complete error report, fails only after aggregation
  when errors exist, and succeeds when `errors` is empty.

## Reference

- https://docs.n8n.io/connect/create-nodes/build-your-node
