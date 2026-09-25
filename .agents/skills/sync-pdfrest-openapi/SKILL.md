---
name: sync-pdfrest-openapi
description: Compare this repository's pdfRest operations with the current OpenAPI specification, implement API discrepancies in reviewable commits, update the reviewed version marker, and add straightforward CI workflow coverage. Use for a requested pdfRest API spec sync; do not use for an unrelated node edit.
---

# Sync pdfRest OpenAPI

Use this skill from the `n8n-nodes-pdfrest` repository root. Read `AGENTS.md` first; its node, CI, workflow-definition, and release rules apply throughout. The live specification at `https://api.pdfrest.com/pdfrest_openapi.json` is the API contract. Use the pdfRest documentation MCP for supporting explanations when useful. Do not add a duplicate contract matrix or choose a spec URL through an environment variable.

## Compare the current API

1. Read `.pdfrest-openapi-version`, inspect the worktree, and fetch the current specification. Record its `info.version` and review the actual schema even when the version marker already matches; the marker records a review baseline, not completeness.
2. Inventory the repository's operation descriptors, shared input/output helpers, and existing contract tests. Compare supported routes and methods, input branches, required and optional fields, response behavior, and relevant enum/default changes with the specification. Distinguish an API discrepancy from an intentional UI wording or layout choice. Check that a proposed operation does not duplicate an existing n8n node.
3. Make a concrete list of discrepancies and the affected operations. Use the fetched specification for each implementation decision; do not infer request fields from another operation or from a test workflow.

## Implement and commit

- Reconcile each API feature or coherent group of related fields with the spec. Follow the repository's declarative node conventions, use n8n HTTP helpers, and add no external runtime dependencies. Keep credentials, operation registration, tests, and relevant documentation synchronized.
- Commit each new endpoint or independently reviewable behavior as a separate, human-understandable change with its tests. Group tightly coupled fields when splitting would leave an incoherent intermediate state. Before every commit, inspect the staged file list and staged diff and follow the repository's commit-message rules.
- Run build, lint, and unit/API-contract tests. Keep quota-consuming live API checks separate from static validation. Report any live checks that could not be run.
- After all identified API discrepancies are implemented, update root `.pdfrest-openapi-version` to the fetched `info.version` and commit the changed review baseline. If an API discrepancy remains unimplemented, leave the marker unchanged and report the blocker. A deferred CI test branch alone does not block the version update; describe that coverage gap explicitly.

## CI workflow coverage

For a newly implemented endpoint, consider both `test/workflows/test-all-endpoints-json-upload.json` and `test/workflows/test-all-endpoints-multipart-upload.json`. Add coverage only when the endpoint can use an existing input already available in that workflow and needs one pdfRest operation plus the workflow's ordinary error/result bookkeeping. Preserve each workflow's completion barrier and error aggregation pattern.

Defer a workflow addition that needs a new prerequisite API call, a multi-operation chain, a new disk read, or other substantial setup. In particular, the JSON upload workflow must have **no** Read/Write Files from Disk nodes. Do not force parity between the two workflows: an endpoint may be covered in one and deferred in the other. Keep any applicable simple coverage and report each deferred branch with its concrete reason.

When editing an n8n workflow definition, use serialized node parameter names and option values from the descriptor, preserve existing node IDs and credential references, and update `docs/ci.md` with the CI behavior. Verify exact allowed top-level keys and render the workflow with the integration renderer. If API-response metadata needs cleanup, use `sanitize-n8n-workflow-export`. Do not treat the published-package scan as a test of these unpublished changes.

Finish with the reviewed spec version, implemented features, ordered commits, validation results, and any deferred CI branches or unresolved API discrepancies.
