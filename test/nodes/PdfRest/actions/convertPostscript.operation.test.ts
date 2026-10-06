import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { pdfRestDescription } from '../../../../nodes/PdfRest/actions';
import {
	convertPostscriptDescription,
	convertPostscriptOperation,
} from '../../../../nodes/PdfRest/actions/convertPostscript.operation';

const options = convertPostscriptDescription.find((field) => field.name === 'options')?.options ?? [];
const option = (name: string) => options.find((field) => field.name === name);

describe('Convert PDF to PostScript operation', () => {
	it('uses the PostScript route and offers file or resource ID input', () => {
		expect(convertPostscriptOperation).toMatchObject({
			value: 'convertPostscript',
			routing: { request: { method: 'POST', url: '/postscript' } },
		});
		const selectors = pdfRestDescription.filter(
			(field) =>
				field.name === 'inputType' &&
				field.displayOptions?.show?.operation?.includes('convertPostscript'),
		);
		expect(selectors).toHaveLength(1);
		expect(selectors[0]).toMatchObject({
			default: 'inputFile',
			options: [
				{ name: 'Input File', value: 'inputFile' },
				{ name: 'Resource ID', value: 'resourceId' },
			],
		});
	});

	it('maps every request option to the OpenAPI field and default', () => {
		expect(options.map((field) => field.name)).toEqual([
			'binaryOutput',
			'includeFileInfo',
			'output',
			'pageRange',
			'postscriptLevel',
			'printAnnotations',
			'rotate',
			'scale',
			'shrinkToFit',
		]);
		for (const [name, property, defaultValue] of [
			['binaryOutput', 'binary_output', true],
			['pageRange', 'page_range', 'all'],
			['postscriptLevel', 'ps_level', 3],
			['printAnnotations', 'print_annotations', true],
			['rotate', 'rotate', false],
			['scale', 'scale', 1],
			['shrinkToFit', 'shrink_to_fit', false],
		] as const) {
			expect(option(name)).toMatchObject({
				default: defaultValue,
				routing: { send: { type: 'body', property } },
			});
		}
		expect(option('postscriptLevel')?.options?.map((entry) => entry.value)).toEqual([2, 3]);
		expect(option('output')?.routing?.send?.property).toBe('output');
	});

	it('accepts positive scales and rejects zero or negative scales', async () => {
		const hook = option('scale')?.routing?.send?.preSend?.[0];
		const context = {
			getNode: () => ({ name: 'Convert PDF to PostScript' }),
		} as unknown as IExecuteSingleFunctions;
		for (const scale of [0.001, 1, 2]) {
			const request: IHttpRequestOptions = { url: '/postscript', body: { scale } };
			await expect(hook?.call(context, request)).resolves.toBe(request);
		}
		for (const scale of [0, -1, Number.POSITIVE_INFINITY]) {
			await expect(hook?.call(context, { url: '/postscript', body: { scale } })).rejects.toThrow(
				'Scale must be a number greater than zero',
			);
		}
	});
});
