import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import {
	addTextDescription,
	addTextOperation,
} from '../../../../nodes/PdfRest/actions/addText.operation';

function getField(name: string) {
	return addTextDescription.find((field) => field.name === name);
}

function getOptionalField(name: string) {
	return getField('options')?.options?.find((field) => field.name === name);
}

function context(tagEnabled: unknown = false): IExecuteSingleFunctions {
	return {
		getNode: () => ({
			name: 'Add Text Blocks to PDF',
			type: '@pdfrest/n8n-nodes-pdfrest.pdfRest',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getNodeParameter: (name: string, fallback: unknown) => {
			expect(name).toBe('options.tagEnabled');
			expect(fallback).toBe(false);
			return tagEnabled;
		},
	} as unknown as IExecuteSingleFunctions;
}

const rgbTextObject = {
	font: 'Arial',
	max_width: '160',
	opacity: '1',
	page: '1',
	rotation: '0',
	text: 'Hello, PDF world!',
	text_color_rgb: '0,0,0',
	text_size: '12',
	x: '144',
	y: '144',
};

const textObjectsExample = [
	rgbTextObject,
	{
		font: 'Times New Roman',
		max_width: '175',
		opacity: '1',
		page: '2',
		rotation: '0',
		text: 'مرحبا بالعالم',
		text_color_rgb: '0,0,0',
		text_size: '72',
		x: '144',
		y: '720',
		is_rtl: 'true',
	},
	{
		font: 'Arial',
		max_width: '160',
		opacity: '0.35',
		page: '1',
		rotation: '0',
		text: 'SAMPLE DRAFT',
		text_color_rgb: '128,128,128',
		text_size: '14',
		x: '360',
		y: '36',
	},
];

describe('Add Text to PDF operation', () => {
	it('uses the OpenAPI operation identity and JSON route', () => {
		expect(addTextOperation).toMatchObject({
			name: 'Add Text Blocks to PDF',
			value: 'addText',
			action: 'Modify · Add Text to PDF',
			routing: {
				request: {
					method: 'POST',
					url: '/pdf-with-added-text',
					headers: { 'Content-Type': 'application/json' },
				},
			},
		});
	});

	it('routes the required public resource ID and JSON text objects', async () => {
		expect(getField('resourceId')).toMatchObject({
			displayName: 'Resource ID',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { operation: ['addText'] } },
			routing: { send: { type: 'body', property: 'id' } },
		});
		expect(getField('textObjects')).toMatchObject({
			displayName: 'Text Objects',
			type: 'json',
			required: true,
			displayOptions: { show: { operation: ['addText'] } },
			routing: { send: { type: 'body', property: 'text_objects' } },
		});
		expect(String(getField('textObjects')?.default)).toContain('\n');
		expect(JSON.parse(String(getField('textObjects')?.default))).toEqual(textObjectsExample);
		const request: IHttpRequestOptions = {
			url: '/pdf-with-added-text',
			body: { text_objects: textObjectsExample },
		};
		await expect(
			getField('textObjects')?.routing?.send?.preSend?.[0]?.call(context(), request),
		).resolves.toBe(request);
	});

	it('accepts typed JSON, literal JSON, and expression-resolved JSON', async () => {
		const preSend = getField('textObjects')?.routing?.send?.preSend?.[0];
		for (const input of [[rgbTextObject], JSON.stringify([rgbTextObject]), [rgbTextObject]]) {
			const request: IHttpRequestOptions = {
				url: '/pdf-with-added-text',
				body: { id: 'pdf-id', text_objects: input },
			};
			await expect(preSend?.call(context(), request)).resolves.toBe(request);
			expect((request.body as Record<string, unknown>).text_objects).toBe(
				JSON.stringify([rgbTextObject]),
			);
		}
	});

	it('accepts the complete CMYK branch and every tagging property when enabled', async () => {
		const textObject = {
			font: 'Times New Roman',
			max_width: '175',
			opacity: '0.35',
			page: 'all',
			rotation: '-45',
			text: 'مرحبا بالعالم',
			text_color_cmyk: '0,100,100,0',
			text_size: '100',
			x: '-10',
			y: '720',
			is_rtl: 'true',
			tag_actual_text: 'Hello world',
			tag_is_artifact: false,
			tag_structure_type: 'H1',
		};
		const request: IHttpRequestOptions = {
			url: '/pdf-with-added-text',
			body: { text_objects: [textObject] },
		};
		await getField('textObjects')?.routing?.send?.preSend?.[0]?.call(context(true), request);
		expect((request.body as Record<string, unknown>).text_objects).toBe(JSON.stringify([textObject]));
	});

	it('accepts every PDF content structure type', async () => {
		const types = [
			'P',
			'H',
			'H1',
			'H2',
			'H3',
			'H4',
			'H5',
			'H6',
			'Lbl',
			'Span',
			'Quote',
			'Note',
			'Reference',
			'BibEntry',
			'Code',
			'Link',
			'Annot',
			'Ruby',
			'RB',
			'RT',
			'RP',
			'Warichu',
			'WT',
			'WP',
			'Figure',
			'Formula',
			'Form',
		];
		const request: IHttpRequestOptions = {
			url: '/pdf-with-added-text',
			body: {
				text_objects: types.map((tag_structure_type) => ({
					...rgbTextObject,
					tag_structure_type,
				})),
			},
		};
		await expect(
			getField('textObjects')?.routing?.send?.preSend?.[0]?.call(context(true), request),
		).resolves.toBe(request);
	});

	it.each([
		['invalid JSON', '{'],
		['non-array', rgbTextObject],
		['empty array', []],
		['non-object item', [null]],
		['extra property', [{ ...rgbTextObject, unsupported: true }]],
		['missing required property', [{ ...rgbTextObject, font: undefined }]],
		['non-string required property', [{ ...rgbTextObject, page: 1 }]],
		['invalid opacity', [{ ...rgbTextObject, opacity: '1.1' }]],
		['non-string opacity', [{ ...rgbTextObject, opacity: 1 }]],
		['text size below minimum', [{ ...rgbTextObject, text_size: '4' }]],
		['text size above maximum', [{ ...rgbTextObject, text_size: '101' }]],
		['non-string optional property', [{ ...rgbTextObject, is_rtl: true }]],
		['missing color', [{ ...rgbTextObject, text_color_rgb: undefined }]],
		['both colors', [{ ...rgbTextObject, text_color_cmyk: '0,0,0,100' }]],
		['empty actual text', [{ ...rgbTextObject, tag_actual_text: '' }]],
		['non-boolean artifact flag', [{ ...rgbTextObject, tag_is_artifact: 'false' }]],
		['unknown structure type', [{ ...rgbTextObject, tag_structure_type: 'Section' }]],
	])('rejects %s', async (_case, textObjects) => {
		const request: IHttpRequestOptions = {
			url: '/pdf-with-added-text',
			body: { text_objects: textObjects },
		};
		await expect(
			getField('textObjects')?.routing?.send?.preSend?.[0]?.call(context(true), request),
		).rejects.toThrow();
	});

	it('requires top-level tagging for every text-object tag property', async () => {
		for (const property of ['tag_actual_text', 'tag_is_artifact', 'tag_structure_type'] as const) {
			const values = {
				tag_actual_text: 'Replacement',
				tag_is_artifact: false,
				tag_structure_type: 'P',
			};
			const request: IHttpRequestOptions = {
				url: '/pdf-with-added-text',
				body: { text_objects: [{ ...rgbTextObject, [property]: values[property] }] },
			};
			await expect(
				getField('textObjects')?.routing?.send?.preSend?.[0]?.call(context(false), request),
			).rejects.toThrow('tag properties require Tag Enabled to be true');
		}
	});

	it('maps optional fields alphabetically with progressive tag disclosure', () => {
		expect(getField('options')).toMatchObject({
			displayName: 'Optional Fields',
			type: 'collection',
			default: {},
			displayOptions: { show: { operation: ['addText'] } },
		});
		expect(getField('options')?.options?.map(({ name }) => name)).toEqual([
			'includeFileInfo',
			'output',
			'responseType',
			'tagEnabled',
			'tagLanguage',
		]);
		expect(getOptionalField('tagEnabled')).toMatchObject({
			displayName: 'Tag Enabled',
			type: 'boolean',
			default: false,
			description: expect.stringMatching(/^Whether to/),
			routing: { send: { type: 'body', property: 'tag_enabled' } },
		});
		expect(getOptionalField('tagLanguage')).toMatchObject({
			displayName: 'Tag Language',
			type: 'string',
			default: 'en-US',
			displayOptions: { show: { tagEnabled: [true] } },
			routing: { send: { type: 'body', property: 'tag_language' } },
		});
	});

	it('removes inactive tag language and validates active BCP 47 language tags', async () => {
		const preSend = getOptionalField('tagEnabled')?.routing?.send?.preSend?.[0];
		const inactiveRequest: IHttpRequestOptions = {
			url: '/pdf-with-added-text',
			body: { tag_enabled: false, tag_language: 'stale' },
		};
		await preSend?.call(context(false), inactiveRequest);
		expect(inactiveRequest.body).toEqual({ tag_enabled: false });

		for (const tag_language of ['en-US', 'zh-Hant-TW', 'i-klingon', 'x-private']) {
			const request: IHttpRequestOptions = {
				url: '/pdf-with-added-text',
				body: { tag_enabled: true, tag_language },
			};
			await expect(preSend?.call(context(true), request)).resolves.toBe(request);
		}
		for (const tag_language of ['', 'english_US', '-en', 'en--US']) {
			const request: IHttpRequestOptions = {
				url: '/pdf-with-added-text',
				body: { tag_enabled: true, tag_language },
			};
			await expect(preSend?.call(context(true), request)).rejects.toThrow(
				'Tag Language must be a valid BCP 47 language tag',
			);
		}
		await expect(
			preSend?.call(context('true'), {
				url: '/pdf-with-added-text',
				body: { tag_enabled: 'true' },
			}),
		).rejects.toThrow('Tag Enabled must be a boolean');
		await expect(
			getField('textObjects')?.routing?.send?.preSend?.[0]?.call(context('false'), {
				url: '/pdf-with-added-text',
				body: { text_objects: [rgbTextObject] },
			}),
		).rejects.toThrow('Tag Enabled must be a boolean');
	});

	it('validates output and routes inherited headers while omitting Response-Type by default', async () => {
		const output = getOptionalField('output');
		expect(output).toMatchObject({
			displayName: 'Output File Name',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'output' } },
		});
		await expect(
			output?.routing?.send?.preSend?.[0]?.call(context(), {
				url: '/pdf-with-added-text',
				body: { output: '' },
			}),
		).rejects.toThrow('Output File Name must contain at least one character');

		const includeFileInfo = getOptionalField('includeFileInfo');
		const includeRequest: IHttpRequestOptions = { url: '/pdf-with-added-text' };
		await includeFileInfo?.routing?.send?.preSend?.[0]?.call(
			{ getNodeParameter: () => false } as unknown as IExecuteSingleFunctions,
			includeRequest,
		);
		expect(includeRequest.headers).toEqual({ 'Include-File-Info': false });

		const responseType = getOptionalField('responseType');
		expect(responseType).toMatchObject({ default: '' });
		const responseRequest: IHttpRequestOptions = {
			url: '/pdf-with-added-text',
			headers: { Accept: 'application/json', 'Response-Type': '' },
		};
		await responseType?.routing?.send?.preSend?.[0]?.call(
			{ getNodeParameter: () => '' } as unknown as IExecuteSingleFunctions,
			responseRequest,
		);
		expect(responseRequest.headers).toEqual({ Accept: 'application/json' });
	});

	it('exposes exact JSON request properties without a public binary input', () => {
		const definition = JSON.stringify(addTextDescription);
		expect(definition).not.toContain('inputType');
		expect(definition).not.toContain('inputFileDataFieldName');
		expect(definition).not.toContain('Input File');
		expect(definition).not.toContain('"property":"file"');

		const bodyProperties = addTextDescription.flatMap((field) => [
			...(field.routing?.send?.type === 'body' ? [field.routing.send.property] : []),
			...(field.options ?? []).flatMap((option) =>
				option.routing?.send?.type === 'body' ? [option.routing.send.property] : [],
			),
		]);
		expect(bodyProperties).toEqual(['id', 'text_objects', 'output', 'tag_enabled', 'tag_language']);
	});
});
