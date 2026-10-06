import { describe, expect, it } from 'vitest';
import errorAggregationWorkflow from '../workflows/error-aggregation-example.json';
import jsonUploadWorkflow from '../workflows/test-all-endpoints-json-upload.json';
import multipartUploadWorkflow from '../workflows/test-all-endpoints-multipart-upload.json';

// The integration helper is plain ESM so CI can execute it without a build step.
// @ts-expect-error The JavaScript helper intentionally does not publish TypeScript declarations.
import {
	addRequestInputs,
	buildArtifact,
	buildSummary,
	extractRequestManifests,
	extractWorkflowErrors,
	formatError,
	sanitizeError,
} from '../../scripts/integration/write-github-summary.mjs';

const canaries = [
	'pdfrest_test_api_key_canary',
	'resource-id-canary-8675309',
	'https://example.invalid/private/customer.pdf',
	'correct-horse-battery-staple',
	'Bearer authorization-header-canary',
	'context-canary-private-data',
	'cause-canary-private-data',
	'customer-secret-filename.pdf',
];
const structuredErrors = [
	{
		node: 'Compress PDF',
		details: {
			name: 'NodeApiError',
			message: canaries[0],
			description: canaries[1],
			httpCode: '400',
			responseMessage: canaries[2],
			itemIndex: 0,
			context: { authorization: canaries[4], requestId: canaries[5] },
			cause: canaries[6],
			inputs: [
				{
					location: 'body',
					name: 'file',
					type: 'inputFile',
					binaryField: 'data',
					fileName: canaries[7],
					mimeType: 'application/pdf',
					bytes: 2674,
					value: canaries[3],
				},
			],
		},
	},
];

describe('write GitHub live-test summary', () => {
	it('keeps complete request context and causes out of workflow aggregation', () => {
		const workflows = [
			errorAggregationWorkflow,
			jsonUploadWorkflow,
			multipartUploadWorkflow,
		];
		let captureCount = 0;

		for (const workflow of workflows) {
			for (const node of workflow.nodes) {
				const output = node.parameters?.jsonOutput;
				if (typeof output !== 'string' || !output.includes('$input.item.error')) continue;
				captureCount += 1;
				expect(output).not.toContain('context: $input.item.error?.context');
				expect(output).not.toContain('cause: $input.item.error?.cause');
				expect(output).toContain('itemIndex: $itemIndex');
				expect(output).toContain('responseMessage:');
			}
		}

		expect(captureCount).toBeGreaterThan(0);
	});

	it('extracts aggregated errors and correlates request metadata', () => {
		const manifest = {
			node: 'Compress PDF',
			itemIndex: 0,
			method: 'POST',
			operation: 'compress',
			inputs: [
				{
					location: 'body',
					name: 'file',
					type: 'inputFile',
					binaryField: 'data',
					mimeType: 'application/pdf',
					bytes: 123,
				},
				{ location: 'body', name: 'quality', type: 'string' },
			],
		};
		const log = [
			'n8n output',
			JSON.stringify({ data: { errors: structuredErrors } }, null, 2),
			`pdfRest request manifest ${JSON.stringify(manifest)}`,
			'Error executing workflow',
		].join('\n');

		const extracted = extractWorkflowErrors(log);
		expect(extracted).toEqual(structuredErrors);
		const manifests = extractRequestManifests(log);
		expect(manifests).toEqual([manifest]);
		const enriched = addRequestInputs(
			extracted.map((error) => ({ ...error, details: { ...error.details, inputs: undefined } })),
			manifests,
		);
		expect(enriched[0]?.details.inputs).toEqual(manifest.inputs);
	});

	it('formats only the sanitized diagnostic allowlist', () => {
		const sanitized = sanitizeError(structuredErrors[0]);

		expect(sanitized).toEqual({
			node: 'Compress PDF',
			itemIndex: 0,
			httpStatus: 400,
			classification: 'client-request',
			errorCode: 'HTTP_400',
			message: 'The API rejected this request',
			inputs: [
				{
					location: 'body',
					name: 'file',
					type: 'inputFile',
					mimeType: 'application/pdf',
					bytes: 2674,
				},
			],
		});
		const summary = formatError(sanitized);
		expect(summary).toContain('Compress PDF');
		expect(summary).toContain('Item index:** 0');
		expect(summary).toContain('HTTP status:** 400');
		expect(summary).toContain('Classification:** client-request');
		expect(summary).toContain('Error code:** HTTP\\_400');
		expect(summary).toContain('Message:** The API rejected this request');
		expect(summary).toContain('body / file / inputFile: application/pdf, 2674');
		for (const canary of canaries) expect(summary).not.toContain(canary);
	});

	it('uses fixed messages for known local errors and hides unknown text', () => {
		const missingBinary = sanitizeError({
			node: 'Convert PDF to PostScript',
			details: {
				name: 'NodeOperationError',
				message: `This operation expects a binary file, but none was found: ${canaries[7]}`,
			},
		});
		expect(missingBinary).toMatchObject({
			errorCode: 'MISSING_BINARY_INPUT',
			message: 'The selected input file field is missing from this item',
		});
		const unknown = sanitizeError({
			node: 'Convert PDF to PostScript',
			details: { name: 'NodeOperationError', message: canaries.join(' ') },
		});
		expect(unknown).toMatchObject({
			errorCode: 'NODE_OPERATION',
			message: 'The node could not process this item',
		});
		for (const canary of canaries) {
			expect(JSON.stringify([missingBinary, unknown])).not.toContain(canary);
		}
	});

	it('keeps canaries out of the job summary and artifact payload', () => {
		const diagnostics = {
			version: 1,
			outcome: 'failure',
			workflows: [
				{
					workflow: 'test-all-endpoints-canary',
					status: 'failed',
					errors: [sanitizeError(structuredErrors[0])],
				},
			],
		};
		const artifact = buildArtifact(diagnostics);
		expect(artifact).toEqual({ errors: diagnostics.workflows[0]?.errors });
		const publicOutput = [buildSummary({ diagnostics }), JSON.stringify(artifact)].join('\n');

		expect(publicOutput).toContain('client-request');
		for (const canary of canaries) expect(publicOutput).not.toContain(canary);
	});
});
