import { describe, expect, it } from 'vitest';
import { createZugferdDescription } from '../../nodes/PdfRest/actions/createZugferd.operation';

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
	['resource ID', jsonWorkflow as Workflow, 'Merge Results 5', 7],
	['multipart', multipartWorkflow as Workflow, 'Merge Single-Input Results 4', 3],
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

describe.each(workflows)('%s live workflow', (_, workflow, merge, postscriptInput) => {
	it('converts a PDF to PostScript and reports the branch outcome', () => {
		const conversion = node(workflow, 'Convert PDF to PostScript');
		expect(conversion.parameters.operation).toBe('convertPostscript');
		expect(conversion.onError).toBe('continueErrorOutput');
		connects(workflow, 'Convert PDF to PostScript', 'Record Convert PDF to PostScript Result');
		connects(workflow, 'Convert PDF to PostScript', 'Record Convert PDF to PostScript Result', 1);
		connects(workflow, 'Record Convert PDF to PostScript Result', merge, 0, postscriptInput);
	});
});

describe('resource ID live workflow', () => {
	it('selects the uploaded PDF resource for PostScript conversion', () => {
		const parameters = node(jsonWorkflow as Workflow, 'Convert PDF to PostScript').parameters;
		expect(parameters).toMatchObject({
			inputType: 'resourceId',
			resourceId: '={{ $json.files[0].id }}',
		});
		expect(parameters.inputFileDataFieldName).toBeUndefined();
	});

	it('uses no disk file nodes or ZUGFeRD operations', () => {
		const workflow = jsonWorkflow as Workflow;
		expect(workflow.nodes.some((entry) => entry.type === 'n8n-nodes-base.readWriteFile')).toBe(false);
		expect(
			workflow.nodes.some((entry) =>
				['createZugferd', 'validateZugferd'].includes(String(entry.parameters.operation)),
			),
		).toBe(false);
	});
});

describe('multipart live workflow', () => {
	it('aggregates PostScript and job options before conversion', () => {
		const workflow = multipartWorkflow as Workflow;
		const read = 'Read PostScript and Job Options';
		const aggregate = 'Aggregate PostScript and Job Options';
		const convert = 'Convert PostScript With Job Options';
		const result = 'Record PostScript With Job Options Result';
		expect(node(workflow, read).parameters.fileSelector).toBe('test/fixtures/ps-joboptions/*');
		expect(node(workflow, aggregate).parameters).toMatchObject({
			aggregate: 'aggregateAllItemData',
			options: { includeBinaries: true },
		});
		expect(node(workflow, convert).parameters).toMatchObject({
			operation: 'convertToPdf',
			inputType: 'inputFile',
			inputFileDataFieldName: 'data',
			conversionType: 'postscript',
			options: { jobOptions: { source: { inputType: 'inputFile', fileDataFieldName: 'data_1' } } },
		});
		connects(workflow, read, aggregate);
		connects(workflow, aggregate, convert);
		connects(workflow, convert, result);
		connects(workflow, convert, result, 1);
		for (const name of [
			result,
			'Record Read PostScript and Job Options Error',
			'Record Aggregate PostScript and Job Options Error',
		]) {
			connects(workflow, name, 'Merge Single-Input Results 4', 0, 5);
		}
		expect(node(workflow, 'Merge Single-Input Results 4').parameters.numberInputs).toBe(6);
	});

	it('passes the read PDF directly to PostScript conversion', () => {
		const workflow = multipartWorkflow as Workflow;
		const parameters = node(workflow, 'Convert PDF to PostScript').parameters;
		expect(parameters).toMatchObject({
			inputType: 'inputFile',
			inputFileDataFieldName: 'data',
		});
		expect(parameters.resourceId).toBeUndefined();
		expect(workflow.nodes.some((entry) => entry.name === 'Upload PDF for PostScript')).toBe(false);
		connects(workflow, 'Read PDF for PostScript', 'Convert PDF to PostScript');
		connects(workflow, 'Record Read PDF for PostScript Error', 'Merge Single-Input Results 4', 0, 3);
	});

	it('creates an invoice PDF and validates its output ID', () => {
		const workflow = multipartWorkflow as Workflow;
		const creation = node(workflow, 'Create ZUGFeRD PDF');
		const validation = node(workflow, 'Validate Created ZUGFeRD PDF');
		expect(creation.parameters.operation).toBe('createZugferd');
		expect(creation.parameters.inputType).toBeUndefined();
		const defaultRenderOptions = createZugferdDescription
			.find((field) => field.name === 'options')
			?.options?.find((field) => field.name === 'renderOptions')?.default;
		expect((creation.parameters.options as Record<string, unknown>).renderOptions).toBe(
			defaultRenderOptions,
		);
		expect(validation.parameters).toMatchObject({
			operation: 'validateZugferd',
			inputType: 'resourceId',
			resourceId: '={{ $json.outputId }}',
		});
		expect(creation.onError).toBe('continueErrorOutput');
		expect(validation.onError).toBe('continueErrorOutput');
		connects(workflow, 'Read Invoice XML for ZUGFeRD', 'Create ZUGFeRD PDF');
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
			connects(workflow, result, 'Merge Single-Input Results 4', 0, 4);
		}
		expect(node(workflow, 'Read Invoice XML for ZUGFeRD').parameters.fileSelector).toBe(
			'test/fixtures/zugferd/factur-x-minimum.xml',
		);
	});
});
