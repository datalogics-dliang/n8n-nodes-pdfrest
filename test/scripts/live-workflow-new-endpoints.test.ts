import { describe, expect, it } from 'vitest';

import jsonWorkflow from '../workflows/test-all-endpoints-json-upload.json';
import multipartWorkflow from '../workflows/test-all-endpoints-multipart-upload.json';

type Workflow = {
	nodes: Array<{
		name: string;
		type: string;
		onError?: string;
		parameters: Record<string, unknown>;
	}>;
	connections: Record<string, { main: Array<Array<{ node: string; index: number }>> }>;
};

const workflows = [
	['resource ID', jsonWorkflow as Workflow, 'Merge Results 5', 7, 8],
	['multipart', multipartWorkflow as Workflow, 'Merge Single-Input Results 4', 3, 4],
] as const;

function node(workflow: Workflow, name: string) {
	const found = workflow.nodes.find((entry) => entry.name === name);
	expect(found, `${name} should exist`).toBeDefined();
	return found!;
}

function connects(workflow: Workflow, source: string, target: string, output = 0, input = 0) {
	expect(workflow.connections[source]?.main[output]).toContainEqual({
		node: target,
		type: 'main',
		index: input,
	});
}

describe.each(workflows)('%s live workflow', (_, workflow, merge, postscriptInput, zugferdInput) => {
	it('converts a PDF resource to PostScript and reports the branch outcome', () => {
		const conversion = node(workflow, 'Convert PDF to PostScript');
		expect(conversion.parameters).toMatchObject({
			operation: 'convertPostscript',
			resourceId: '={{ $json.files[0].id }}',
		});
		expect(conversion.onError).toBe('continueErrorOutput');
		connects(workflow, 'Convert PDF to PostScript', 'Record Convert PDF to PostScript Result');
		connects(workflow, 'Convert PDF to PostScript', 'Record Convert PDF to PostScript Result', 1);
		connects(workflow, 'Record Convert PDF to PostScript Result', merge, 0, postscriptInput);
	});

	it('creates an invoice PDF, validates its output ID, and rejects INVALID status', () => {
		const creation = node(workflow, 'Create ZUGFeRD PDF');
		const validation = node(workflow, 'Validate Created ZUGFeRD PDF');
		expect(creation.parameters.operation).toBe('createZugferd');
		expect(validation.parameters).toMatchObject({
			operation: 'validateZugferd',
			inputType: 'resourceId',
			resourceId: '={{ $json.outputId }}',
		});
		expect(creation.onError).toBe('continueErrorOutput');
		expect(validation.onError).toBe('continueErrorOutput');
		connects(workflow, 'Create ZUGFeRD PDF', 'Validate Created ZUGFeRD PDF');
		connects(workflow, 'Create ZUGFeRD PDF', 'Record Create ZUGFeRD PDF Error', 1);
		connects(workflow, 'Validate Created ZUGFeRD PDF', 'Record ZUGFeRD Validation Result');
		connects(workflow, 'Validate Created ZUGFeRD PDF', 'Record ZUGFeRD Validation Result', 1);
		expect(node(workflow, 'Record ZUGFeRD Validation Result').parameters.jsonOutput).toContain(
			"$json.status === 'VALID'",
		);
		for (const result of [
			'Record Read Invoice XML Error',
			'Record Create ZUGFeRD PDF Error',
			'Record ZUGFeRD Validation Result',
		]) {
			connects(workflow, result, merge, 0, zugferdInput);
		}
		expect(node(workflow, 'Read Invoice XML for ZUGFeRD').parameters.fileSelector).toBe(
			'test/fixtures/zugferd/factur-x-minimum.xml',
		);
	});
});

describe('resource ID live workflow', () => {
	it('uploads invoice XML and records upload failures in the same completion slot', () => {
		const workflow = jsonWorkflow as Workflow;
		connects(workflow, 'Read Invoice XML for ZUGFeRD', 'Upload Invoice XML for ZUGFeRD');
		connects(workflow, 'Upload Invoice XML for ZUGFeRD', 'Create ZUGFeRD PDF');
		connects(workflow, 'Upload Invoice XML for ZUGFeRD', 'Record Upload Invoice XML Error', 1);
		connects(workflow, 'Record Upload Invoice XML Error', 'Merge Results 5', 0, 8);
		connects(workflow, 'pdfRest', 'Convert PDF to PostScript');
		connects(
			workflow,
			'pdfRest',
			'Record Convert PDF to PostScript Skipped After Shared Upload Failure',
			1,
		);
	});
});

describe('multipart live workflow', () => {
	it('uploads a PDF for PostScript and sends invoice XML directly to creation', () => {
		const workflow = multipartWorkflow as Workflow;
		connects(workflow, 'Read PDF for PostScript', 'Upload PDF for PostScript');
		connects(workflow, 'Upload PDF for PostScript', 'Convert PDF to PostScript');
		connects(workflow, 'Record Read PDF for PostScript Error', 'Merge Single-Input Results 4', 0, 3);
		connects(workflow, 'Record Upload PDF for PostScript Error', 'Merge Single-Input Results 4', 0, 3);
		connects(workflow, 'Read Invoice XML for ZUGFeRD', 'Create ZUGFeRD PDF');
		expect(node(workflow, 'Create ZUGFeRD PDF').parameters.inputType).toBeUndefined();
	});
});
