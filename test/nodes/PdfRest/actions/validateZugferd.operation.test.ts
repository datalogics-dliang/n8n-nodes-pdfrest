import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { pdfRestDescription } from '../../../../nodes/PdfRest/actions';
import {
	validateZugferdDescription,
	validateZugferdOperation,
} from '../../../../nodes/PdfRest/actions/validateZugferd.operation';
import { createDeferredMultipartUploadsPreSend } from '../../../../nodes/PdfRest/helpers/multipart';

describe('Validate ZUGFeRD PDF operation', () => {
	it('uses the OpenAPI validation route and accepts file or resource ID input', () => {
		expect(validateZugferdOperation).toMatchObject({
			value: 'validateZugferd',
			routing: { request: { method: 'POST', url: '/validated-zugferd' } },
		});
		const inputSource = validateZugferdDescription.find((field) => field.name === 'inputType');
		expect(inputSource).toMatchObject({
			default: 'inputFile',
			options: [
				{ name: 'Input File', value: 'inputFile' },
				{ name: 'Resource ID', value: 'resourceId' },
			],
		});
		expect(validateZugferdDescription.find((field) => field.name === 'resourceId')).toMatchObject({
			routing: { send: { type: 'body', property: 'id' } },
		});
		expect(validateZugferdDescription.find((field) => field.name === 'inputFileDataFieldName')).toMatchObject({
			routing: { send: { type: 'body', property: 'file' } },
		});
	});

	it('keeps validation findings as JSON without a file download control', () => {
		expect(validateZugferdDescription.find((field) => field.name === 'options')?.options?.map((field) => field.name)).toEqual([
			'includeFileInfo',
		]);
		expect(
			pdfRestDescription.some(
				(field) =>
					field.name === 'downloadOutputFiles' &&
					field.displayOptions?.show?.operation?.includes('validateZugferd'),
			),
		).toBe(false);
	});

	it('builds a multipart request for a PDF upload', async () => {
		const fileField = validateZugferdDescription.find(
			(field) => field.name === 'inputFileDataFieldName',
		);
		const context = {
			getNodeParameter: () => 'data',
			helpers: {
				assertBinaryData: () => ({ fileName: 'invoice.pdf', mimeType: 'application/pdf' }),
				getBinaryDataBuffer: async () => Buffer.from('pdf'),
			},
		} as unknown as IExecuteSingleFunctions;
		const request: IHttpRequestOptions = {
			url: '/validated-zugferd',
			headers: { 'Content-Type': 'application/json' },
			body: { file: 'data' },
		};
		await fileField?.routing?.send?.preSend?.[0]?.call(context, request);
		await createDeferredMultipartUploadsPreSend().call(context, request);
		expect((request.body as FormData).get('file')).toBeInstanceOf(Blob);
		expect(request.headers).not.toHaveProperty('Content-Type');
	});
});
