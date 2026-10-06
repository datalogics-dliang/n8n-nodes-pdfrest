import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import {
	mergeDescription,
	mergeOperation,
} from '../../../../nodes/PdfRest/actions/merge.operation';

function getOptionalField(name: string) {
	return mergeDescription
		.find((field) => field.name === 'options')
		?.options?.find((field) => field.name === name);
}

function createNodeContext(
	inputs: unknown,
	binaries: Record<string, { buffer: Buffer; fileName: string }> = {},
): IExecuteSingleFunctions {
	return {
		getNode: () => ({
			name: 'Merge Multiple PDFs',
			type: '@pdfrest/n8n-nodes-pdfrest.pdfRest',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getNodeParameter: (name: string) => (name === 'mergeInputs.input' ? inputs : undefined),
		helpers: {
			assertBinaryData: (name: string) => ({
				data: '',
				fileName: binaries[name]?.fileName,
				mimeType: 'application/pdf',
			}),
			getBinaryDataBuffer: async (name: string) => binaries[name].buffer,
		},
	} as unknown as IExecuteSingleFunctions;
}

describe('Merge PDFs operation', () => {
	it('uses the OpenAPI multipart operation identity', () => {
		expect(mergeOperation).toMatchObject({
			name: 'Merge Multiple PDFs',
			value: 'merge',
			action: 'Modify · Merge PDFs',
			routing: {
				request: {
					method: 'POST',
					url: '/merged-pdf',
				},
			},
		});
	});

	it('collects ordered input files or resource IDs with page expressions', () => {
		const mergeInputs = mergeDescription[0];
		expect(mergeInputs).toMatchObject({
			displayName: 'PDFs to Merge',
			placeholder: 'Add PDF to Merge',
			name: 'mergeInputs',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			default: {
				input: [
					{ resourceId: '', pages: '1-last', inputType: 'inputFile' },
					{ resourceId: '', pages: '1-last', inputType: 'inputFile' },
				],
			},
			required: true,
			displayOptions: { show: { operation: ['merge'] } },
			options: [
				{
					displayName: 'PDF',
					name: 'input',
					values: [
						{
							displayName: 'Input Source',
							name: 'inputType',
							type: 'options',
							default: 'inputFile',
						},
						{
							displayName: 'Resource ID',
							name: 'resourceId',
							type: 'string',
							required: true,
							displayOptions: { show: { inputType: ['resourceId', 'id'] } },
						},
						{
							displayName: 'Input File Data Field Name',
							name: 'inputFileDataFieldName',
							type: 'string',
							required: true,
							displayOptions: { show: { inputType: ['inputFile'] } },
						},
						{
							displayName: 'Pages',
							name: 'pages',
							type: 'string',
							default: '1-last',
							required: true,
							description:
								'The pages to include from this PDF; use "all" or "1-last" for every page, or select pages with numbers, ranges, "even", or "odd"',
						},
					],
				},
			],
		});
	});

	it('maps ordered resource inputs to repeated multipart fields', async () => {
		const preSend = mergeDescription[0].routing?.send?.preSend?.[0];
		const request: IHttpRequestOptions = {
			url: '/merged-pdf',
			body: { output: 'combined', 'id[]': { input: [] } },
		};
		await preSend?.call(
			createNodeContext([
				{ resourceId: '11111111-1111-4111-8111-111111111111', pages: '1-3,5' },
				{ resourceId: '22222222-2222-4222-8222-222222222222', pages: 'last-1' },
			]),
			request,
		);

		const formData = request.body as unknown as FormData;
		expect(formData).toBeInstanceOf(FormData);
		expect(formData.get('output')).toBe('combined');
		expect(formData.getAll('id[]')).toEqual([
			'11111111-1111-4111-8111-111111111111',
			'22222222-2222-4222-8222-222222222222',
		]);
		expect(formData.getAll('type[]')).toEqual(['id', 'id']);
		expect(formData.getAll('pages[]')).toEqual(['1-3,5', 'last-1']);
	});

	it('uploads multiple files in merge order alongside resource IDs', async () => {
		const preSend = mergeDescription[0].routing?.send?.preSend?.[0];
		const request: IHttpRequestOptions = { url: '/merged-pdf' };
		await preSend?.call(
			createNodeContext(
				[
					{ inputType: 'inputFile', inputFileDataFieldName: 'first', pages: '1-last' },
					{
						inputType: 'resourceId',
						resourceId: '11111111-1111-4111-8111-111111111111',
						pages: '2',
					},
					{ inputType: 'inputFile', inputFileDataFieldName: 'second', pages: '3-last' },
				],
				{
					first: { buffer: Buffer.from('first'), fileName: 'first.pdf' },
					second: { buffer: Buffer.from('second'), fileName: 'second.pdf' },
				},
			),
			request,
		);

		const formData = request.body as unknown as FormData;
		expect((formData.getAll('file') as File[]).map(({ name }) => name)).toEqual([
			'first.pdf',
			'second.pdf',
		]);
		expect(formData.getAll('id[]')).toEqual(['11111111-1111-4111-8111-111111111111']);
		expect(formData.getAll('type[]')).toEqual(['file', 'id', 'file']);
		expect(formData.getAll('pages[]')).toEqual(['1-last', '2', '3-last']);
	});

	it('requires at least one merge input', async () => {
		const preSend = mergeDescription[0].routing?.send?.preSend?.[0];
		for (const inputs of [[], 'invalid', null]) {
			await expect(
				preSend?.call(createNodeContext(inputs), { url: '/merged-pdf', body: {} }),
			).rejects.toThrow('At least one Merge Input is required.');
		}
	});

	it('rejects malformed, non-string, and empty input entries', async () => {
		const preSend = mergeDescription[0].routing?.send?.preSend?.[0];
		const invalidCases: Array<{ inputs: unknown; message: string }> = [
			{ inputs: ['invalid'], message: 'Merge Input 1 must be an object.' },
			{
				inputs: [{ resourceId: 123, pages: '1-last' }],
				message: 'Resource ID for Merge Input 1 must contain at least one character.',
			},
			{
				inputs: [{ resourceId: '   ', pages: '1-last' }],
				message: 'Resource ID for Merge Input 1 must contain at least one character.',
			},
			{
				inputs: [{ resourceId: '11111111-1111-4111-8111-111111111111', pages: 1 }],
				message: 'Pages for Merge Input 1 must contain at least one character.',
			},
			{
				inputs: [{ resourceId: '11111111-1111-4111-8111-111111111111', pages: '' }],
				message: 'Pages for Merge Input 1 must contain at least one character.',
			},
		];

		for (const { inputs, message } of invalidCases) {
			await expect(
				preSend?.call(createNodeContext(inputs), { url: '/merged-pdf', body: {} }),
			).rejects.toThrow(message);
		}
	});

	it('groups optional fields alphabetically and validates the output name', async () => {
		const optionalFields = mergeDescription[1];
		expect(optionalFields).toMatchObject({
			displayName: 'Optional Fields',
			name: 'options',
			type: 'collection',
			default: {},
			displayOptions: { show: { operation: ['merge'] } },
		});
		expect(optionalFields.options?.map(({ name }) => name)).toEqual([
			'includeFileInfo',
			'output',
			'responseType',
		]);

		const output = getOptionalField('output');
		expect(output).toMatchObject({
			displayName: 'Output File Name',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'output' } },
		});
		const omitted: IHttpRequestOptions = { url: '/merged-pdf', body: {} };
		await expect(
			output?.routing?.send?.preSend?.[0]?.call(createNodeContext([]), omitted),
		).resolves.toBe(omitted);
		const invalid: IHttpRequestOptions = { url: '/merged-pdf', body: { output: '' } };
		await expect(
			output?.routing?.send?.preSend?.[0]?.call(createNodeContext([]), invalid),
		).rejects.toThrow('Output File Name must contain at least one character.');
	});

	it('routes Include-File-Info and omits Response-Type by default', async () => {
		const includeFileInfo = getOptionalField('includeFileInfo');
		const responseType = getOptionalField('responseType');
		expect(includeFileInfo).toMatchObject({
			type: 'boolean',
			default: false,
		});
		expect(responseType).toMatchObject({
			type: 'options',
			default: '',
			options: [
				{ name: 'Synchronous Response', value: '' },
				{ name: 'Request ID', value: 'requestId' },
			],
		});

		const includeRequest: IHttpRequestOptions = { url: '/merged-pdf' };
		await includeFileInfo?.routing?.send?.preSend?.[0]?.call(
			{ getNodeParameter: () => false } as unknown as IExecuteSingleFunctions,
			includeRequest,
		);
		expect(includeRequest.headers).toEqual({ 'Include-File-Info': false });

		const responseRequest: IHttpRequestOptions = {
			url: '/merged-pdf',
			headers: { Accept: 'application/json', 'Response-Type': '' },
		};
		await responseType?.routing?.send?.preSend?.[0]?.call(
			{ getNodeParameter: () => '' } as unknown as IExecuteSingleFunctions,
			responseRequest,
		);
		expect(responseRequest.headers).toEqual({ Accept: 'application/json' });
	});

	it('exposes multipart file and resource-ID inputs without synthetic body routes', () => {
		const publicDefinition = JSON.stringify(mergeDescription);
		expect(publicDefinition).toContain('Input File');
		expect(publicDefinition).toContain('inputFileDataFieldName');
		expect(publicDefinition).not.toContain('"type":"binary"');
		expect(mergeDescription[0].routing?.send?.preSend).toHaveLength(1);
		expect(getOptionalField('output')?.routing?.send?.property).toBe('output');
	});
});
