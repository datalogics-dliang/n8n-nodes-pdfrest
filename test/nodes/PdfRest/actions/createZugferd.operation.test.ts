import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { pdfRestDescription } from '../../../../nodes/PdfRest/actions';
import {
	createZugferdDescription,
	createZugferdOperation,
} from '../../../../nodes/PdfRest/actions/createZugferd.operation';
import { createDeferredMultipartUploadsPreSend } from '../../../../nodes/PdfRest/helpers/multipart';

const field = (name: string) => createZugferdDescription.find((entry) => entry.name === name);
const prepare = field('pdfInputType')?.routing?.send?.preSend?.[0];

function context(
	pdfInputType = 'none',
	logoInputType = 'none',
	inputType = 'resourceId',
): IExecuteSingleFunctions {
	const binary = {
		xml: { fileName: 'invoice.xml', mimeType: 'application/xml' },
		pdf: { fileName: 'invoice.pdf', mimeType: 'application/pdf' },
		logo: { fileName: 'logo.png', mimeType: 'image/png' },
	};
	const parameters: Record<string, string> = {
		pdfInputType,
		logoInputType,
		inputType,
		inputFileDataFieldName: 'xml',
		pdfFileDataFieldName: 'pdf',
		logoFileDataFieldName: 'logo',
	};
	return {
		getNode: () => ({ name: 'Create ZUGFeRD PDF' }),
		getNodeParameter: (name: string) => parameters[name],
		helpers: {
			assertBinaryData: (name: keyof typeof binary) => binary[name],
			getBinaryDataBuffer: async (name: string) => Buffer.from(name),
		},
	} as unknown as IExecuteSingleFunctions;
}

describe('Create ZUGFeRD PDF operation', () => {
	it('registers the OpenAPI route and one XML input source selector', () => {
		expect(createZugferdOperation).toMatchObject({
			name: 'Create ZUGFeRD / Factur-X PDF Invoice',
			action: 'E-Invoicing · Create ZUGFeRD / Factur-X PDF Invoice',
			value: 'createZugferd',
			routing: { request: { method: 'POST', url: '/zugferd-pdf' } },
		});
		const selectors = pdfRestDescription.filter(
			(entry) =>
				entry.name === 'inputType' &&
				entry.displayOptions?.show?.operation?.includes('createZugferd'),
		);
		expect(selectors).toHaveLength(1);
		expect(selectors[0].default).toBe('inputFile');
		expect(field('inputFileDataFieldName')?.routing?.send?.property).toBe('file');
		expect(field('resourceId')?.routing?.send?.property).toBe('id');
	});

	it('offers optional source PDF and logo file or resource ID branches', () => {
		for (const [selector, fileName, fileKey, idName, idKey] of [
			['pdfInputType', 'pdfFileDataFieldName', 'pdf_file', 'pdfResourceId', 'pdf_id'],
			['logoInputType', 'logoFileDataFieldName', 'logo_file', 'logoResourceId', 'logo_id'],
		] as const) {
			expect(field(selector)).toMatchObject({
				default: 'none',
				options: [
					{ name: 'None', value: 'none' },
					{ name: 'Input File', value: 'inputFile' },
					{ name: 'Resource ID', value: 'resourceId' },
				],
			});
			expect(field(fileName)).toMatchObject({
				displayOptions: { show: { [selector]: ['inputFile'] } },
				routing: { send: { type: 'body', property: fileKey } },
			});
			expect(field(idName)).toMatchObject({
				displayOptions: { show: { [selector]: ['resourceId'] } },
				routing: { send: { type: 'body', property: idKey } },
			});
		}
		expect(field('options')?.options?.map((entry) => entry.name)).toEqual([
			'includeFileInfo',
			'output',
			'regeneratePdf',
			'renderOptions',
		]);
		expect(field('options')?.options?.find((entry) => entry.name === 'regeneratePdf')).toMatchObject({
			default: false,
			routing: { send: { type: 'body', property: 'regenerate_pdf' } },
		});
		expect(field('options')?.options?.find((entry) => entry.name === 'renderOptions')).toMatchObject({
			type: 'json',
			routing: { send: { type: 'body', property: 'render_options' } },
		});
	});

	it('parses typed render options and removes inactive file branches', async () => {
		const request: IHttpRequestOptions = {
			url: '/zugferd-pdf',
			body: {
				id: 'xml-id',
				pdf_id: 'pdf-id',
				pdf_file: 'stale',
				logo_id: 'stale',
				render_options: '{"locale":"de-DE","logo_corner":"top-right"}',
			},
		};
		await prepare?.call(context('resourceId'), request);
		expect(request.body).toEqual({
			id: 'xml-id',
			pdf_id: 'pdf-id',
			render_options: { locale: 'de-DE', logo_corner: 'top-right' },
		});
		const objectRequest: IHttpRequestOptions = {
			url: '/zugferd-pdf',
			body: { id: 'xml-id', render_options: { locale: 'en-GB' } },
		};
		await prepare?.call(context(), objectRequest);
		expect(objectRequest.body).toMatchObject({ render_options: { locale: 'en-GB' } });
	});

	it('starts selected render options with the OpenAPI example', () => {
		const renderOptions = field('options')?.options?.find((entry) => entry.name === 'renderOptions');
		expect(JSON.parse(renderOptions?.default as string)).toEqual({
			logo_corner: 'top-right',
			font: 'Arial',
			bold_font: 'Arial Bold',
			locale: 'de-DE',
			label_language: 'en',
			currency_display: 'symbol',
			date_format: 'dd.MM.yyyy',
			decimal_precision: 2,
			text_color_rgb: [26, 31, 41],
			muted_text_color_cmyk: [10, 5, 0, 55],
			accent_color_rgb: [20, 64, 115],
			border_color_cmyk: [12, 7, 0, 20],
			table_header_color_rgb: [20, 64, 115],
			table_alternate_color_cmyk: [4, 2, 0, 2],
			footer_message: 'Thank you for your business.',
		});
	});

	it('shows Render Options documentation directly under the optional JSON field', () => {
		expect(field('options')?.options?.find((entry) => entry.name === 'renderOptions')).toMatchObject({
			hint: 'Render Options documentation: <a href="https://docs.pdfrest.com/pdfrest-api-toolkit-cloud/api-reference-guide/tool/create-zugferd-pdf/POST/zugferd-pdf.body.render_options/" target="_blank">Learn how to build the object</a>',
		});
		expect(createZugferdDescription.find((entry) => entry.name === 'renderOptionsNotice')).toBeUndefined();
	});

	it('requires a source PDF when regeneration is enabled', async () => {
		await expect(
			prepare?.call(context(), {
				url: '/zugferd-pdf',
				body: { id: 'xml-id', regenerate_pdf: true },
			}),
		).rejects.toThrow('Regenerate PDF requires a source PDF');
		await expect(
			prepare?.call(context(), { url: '/zugferd-pdf', body: { render_options: '[]' } }),
		).rejects.toThrow('Render Options must be a JSON object');
	});

	it('builds multipart requests for XML, source PDF, and logo files', async () => {
		const execution = context('inputFile', 'inputFile', 'inputFile');
		const request: IHttpRequestOptions = {
			url: '/zugferd-pdf',
			headers: { 'Content-Type': 'application/json' },
			body: {
				file: 'xml',
				pdf_file: 'pdf',
				logo_file: 'logo',
				render_options: { locale: 'de-DE' },
			},
		};
		await prepare?.call(execution, request);
		for (const name of ['inputFileDataFieldName', 'pdfFileDataFieldName', 'logoFileDataFieldName']) {
			await field(name)?.routing?.send?.preSend?.[0]?.call(execution, request);
		}
		await createDeferredMultipartUploadsPreSend().call(execution, request);
		const body = request.body as FormData;
		expect(body.get('file')).toBeInstanceOf(Blob);
		expect(body.get('pdf_file')).toBeInstanceOf(Blob);
		expect(body.get('logo_file')).toBeInstanceOf(Blob);
		const renderOptions = body.get('render_options');
		expect(renderOptions).toBe('{"locale":"de-DE"}');
		const multipartRequest = new Request('https://example.invalid', {
			method: 'POST',
			body,
		});
		const multipartBody = await multipartRequest.text();
		expect(multipartBody).toContain('name="render_options"\r\n');
		expect(multipartBody).not.toContain('name="render_options"; filename=');
		expect(request.headers).not.toHaveProperty('Content-Type');
	});

	it('sends empty render options as a regular multipart field', async () => {
		const execution = context('none', 'none', 'inputFile');
		const request: IHttpRequestOptions = {
			url: '/zugferd-pdf',
			body: { file: 'xml', render_options: '{}' },
		};
		await prepare?.call(execution, request);
		await field('inputFileDataFieldName')?.routing?.send?.preSend?.[0]?.call(execution, request);
		await createDeferredMultipartUploadsPreSend().call(execution, request);
		const body = request.body as FormData;
		expect(body.get('render_options')).toBe('{}');
		expect(body.get('file')).toBeInstanceOf(Blob);
	});
});
