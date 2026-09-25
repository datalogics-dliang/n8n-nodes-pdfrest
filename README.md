# @pdfrest/n8n-nodes-pdfrest

`@pdfrest/n8n-nodes-pdfrest` is an n8n community node for processing documents with the
[pdfRest API](https://pdfrest.com). It provides one **pdfRest API Toolkit** node
with file, resource-ID, and URL inputs where supported by each operation.

## Operations

The node groups its operations by task:

- **Create and modify:** create blank PDFs; add attachments, images, shapes,
  tables, and text; create ZUGFeRD or Factur-X invoice PDFs; merge and split
  PDFs; and set page boxes.
- **Convert:** convert files or webpages to PDF; convert PDFs to BMP, GIF, JPG,
  PNG, TIFF, Excel, PowerPoint, Word, Markdown, PostScript, PDF/A, and PDF/X.
- **Extract and analyze:** extract images and text, make PDFs searchable with
  OCR, query PDF information, summarize PDFs, translate PDF text, and validate
  ZUGFeRD or Factur-X invoice PDFs.
- **Forms:** import and export form data, flatten forms, and convert XFA forms
  to AcroForms.
- **Optimize:** compress PDFs, convert colors, flatten annotations, layers, or
  transparencies, linearize PDFs, and rasterize PDFs.
- **Secure:** add watermarks, encrypt and decrypt PDFs, preview and apply text
  redactions, restrict and remove restrictions, digitally sign PDFs, and set
  the TDM reservation preference.
- **Files:** upload files or public URLs, retrieve files or URLs, delete one or
  more resources, poll request status, and create or extract ZIP archives.

Operation fields follow the current
[pdfRest API documentation](https://docs.pdfrest.com/). Availability and usage
may depend on the configured pdfRest deployment and plan.

## Installation

Both n8n and pdfRest are available in Cloud and Self-hosted deployment options.
All combinations of the two products are supported when n8n can reach the
configured pdfRest endpoint. n8n Cloud requires a publicly reachable pdfRest
deployment. An n8n process running directly on the host can use the published
pdfRest host port.

### n8n

#### Cloud

- n8n Cloud users can find the **pdfRest API Toolkit** in the Nodes panel and add it
  to a workflow.

#### Self-hosted

- Self-hosted n8n administrators can install it from **Settings > Community Nodes**
  using this package name:

```text
@pdfrest/n8n-nodes-pdfrest
```

- Follow n8n's [community-node installation guidance](https://docs.n8n.io/integrations/community-nodes/installation/)
  for the requirements and restrictions of your deployment.

### pdfRest

#### Cloud API

- pdfRest is available via a Cloud API subscription. Plans and pricing details
  are available at [https://pdfrest.com/pricing/#cloud](https://pdfrest.com/pricing/#cloud).
- The Cloud API also offers two hosted locations, a **US-based API** and an
  **EU-based API** that is fully **GDPR-compliant**.

#### Self-hosted container

- The API is also deployable in your private infrastructure as a container,
  giving you full control over your PDF processing environment. Follow the
  [pdfRest API Toolkit Container getting-started guide](https://docs.pdfrest.com/pdfrest-api-toolkit-container/getting-started/)
  to deploy it.
- Configure deployment licensing in pdfRest, not in the n8n credential. Standard
  Container deployments use the pdfRest license-key setup; Enterprise licensing
  alternatives are also configured in the pdfRest deployment. See
  [Container plans and pricing](https://pdfrest.com/pricing/#container) for
  licensing options.

## Authentication

Create a **pdfRest API** credential in n8n.

- For a Cloud deployment, select its **API Base URL** and enter the **API Key**
  for your pdfRest account.
- For a self-hosted deployment, select **Self-Hosted or Container Deployment**
  and enter its **Deployment URL**. Self-hosted deployments do not require an API key,
  and the credential does not send an `Api-Key` header to them.

Deployment URLs must use HTTP or HTTPS and cannot contain embedded credentials,
a query string, or a fragment. Trailing slashes are normalized automatically.

_Support Note: For the n8n Cloud service to access a pdfRest Self-hosted deployment,
the pdfRest deployment must have a **public URL**._

| pdfRest Deployment Type    | API Key                                                                                                  | API Base URL Selection                  | Deployment URL                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| Cloud (USA)                | Create a [pdfRest account](https://pdfrest.com/) to obtain a pdfRest API Toolkit Cloud API key           | `https://api.pdfrest.com`               | Not shown                                |
| Cloud (EU, GDPR-compliant) | Use a pdfRest API Toolkit Cloud API key. [Create a pdfRest account](https://pdfrest.com/) to obtain one  | `https://eu-api.pdfrest.com`            | Not shown                                |
| Container                  | Not required for API requests; configure product licensing separately on [pdfRest](https://pdfrest.com/) | **Self-Hosted or Container Deployment** | The URL of your containerized deployment |

For pdfRest API Toolkit Cloud deployment, see the
[pdfRest API Toolkit Cloud getting-started guide](https://docs.pdfrest.com/pdfrest-api-toolkit-cloud/getting-started/).

For a self-hosted AWS deployment, see the
[pdfRest API Toolkit on AWS getting-started guide](https://docs.pdfrest.com/pdfrest-api-toolkit-on-aws/getting-started/).

For a Container deployment, see the [pdfRest API Toolkit Container getting-started guide](https://docs.pdfrest.com/pdfrest-api-toolkit-container/getting-started/).

_Support Note: pdfRest self-hosted container deployments are supported on x86-64 processors. Emulation on ARM and Apple silicon is not supported._

## Using the Node

1. Add a node that supplies the document or data to process.
2. Add the **pdfRest API Toolkit** node and select the required operation.
3. Select the created pdfRest credential; see [Authentication](#authentication).
4. Choose an available **Input Source** and configure the operation fields.
5. Connect the result to the next node in the workflow.

For an **Input File**, connect a previous node that provides n8n file data and
set **Input File Data Field Name** to its field name. The default field is
`data`. Operations that accept several files expose multiple field-name inputs.

A **Resource ID** identifies a file previously uploaded to or generated by
pdfRest. A **URL** must be publicly reachable by the configured pdfRest service.
The available source choices vary by operation.

For PostScript or EPS input in **Convert Supported Files to PDF**, you can
provide a custom `.joboptions` profile as an input file or Resource ID. This
option is available when the main input is a file or Resource ID.

Completed processing operations return their JSON response by default. Enable
**Download Output Files** to also return their output files. The default
**Output File Data Field Name** is `data`. Operations that can produce multiple
files use this value as a prefix: the first file uses `data`, followed by
`data_1`, `data_2`, and so on in response order.

Operations configured for inline JSON return that JSON without a file download.
Many processing operations can also return a request ID instead of waiting for
completion. Request-ID responses are returned unchanged; use **Poll for an Async
Request Result**, then **Retrieve Resource or Its URL by ID** to download an
asynchronous output file.

## Node.js Compatibility

- Primary tested n8n version: 2.34.5
- Supported Node.js versions for self-hosted installations: 22 and 24
- Primary development runtime: Node.js 22.22.0
- Additional CI target: Node.js 24.19.0

Odd-numbered Node.js releases are not supported. The package adds no external
runtime dependencies and uses n8n's built-in request helpers.

## Data and Security

Documents, public URLs, parameters, and any other operation inputs are sent to
the API Base URL configured in the credential. Review the data-handling,
retention, regional, and quota requirements of that pdfRest deployment before
using sensitive documents.

Store Cloud API keys only in n8n credentials. Do not place credentials in
workflow JSON, expressions, ordinary node fields, or self-hosted deployment URLs.

## Verification and Releases

Stable releases are published only by GitHub Actions after static and live
integration checks pass. The release workflow uses npm trusted publishing and
provenance; maintainers do not publish from development machines.

Repository operators can find environment, trigger, and release procedures in
the
[CI and release runbook](https://github.com/pdfrest/n8n-nodes-pdfrest/blob/develop/docs/ci.md).

## Support

- Node bugs and feature requests:
  [GitHub issues](https://github.com/pdfrest/n8n-nodes-pdfrest/issues)
- pdfRest API questions: [pdfRest support](mailto:support@pdfrest.com)
- pdfRest API reference: [docs.pdfrest.com](https://docs.pdfrest.com/)
- n8n community support: [community.n8n.io](https://community.n8n.io/)

When reporting a problem, include the package version, n8n version, operation,
input source, and sanitized error details. Never include API keys or sensitive
documents.

## Contributing

Development setup, workflow-fixture rules, and validation commands are in
[CONTRIBUTING.md](https://github.com/pdfrest/n8n-nodes-pdfrest/blob/develop/CONTRIBUTING.md).
Detailed implementation invariants are maintained in the repository for
contributors and coding agents.

## License

This project is licensed under the
[MIT License](https://github.com/pdfrest/n8n-nodes-pdfrest/blob/develop/LICENSE.md).
