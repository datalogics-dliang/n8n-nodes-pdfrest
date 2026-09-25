import {
	displayParameter,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
} from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import {
	convertToPdfDescription,
	convertToPdfOperation,
} from '../../../../nodes/PdfRest/actions/convertToPdf.operation';
import { createDeferredMultipartUploadsPreSend } from '../../../../nodes/PdfRest/helpers/multipart';

function getField(name: string) {
	return convertToPdfDescription.find((field) => field.name === name);
}

function getOptionalField(name: string) {
	return getField('options')?.options?.find((field) => field.name === name);
}

function getVisibleOptionalFieldNames(conversionType: string) {
	return getField('options')
		?.options?.filter((field) => {
			const visibleFor = field.displayOptions?.show?.['/conversionType'];
			return visibleFor === undefined || visibleFor.includes(conversionType);
		})
		.map(({ name }) => name);
}

const executionContext = {
	getNode: () => ({
		name: 'Convert to PDF',
		type: '@pdfrest/n8n-nodes-pdfrest.pdfRest',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	}),
} as unknown as IExecuteSingleFunctions;

function branchContext(inputType: string, conversionType: string): IExecuteSingleFunctions {
	return {
		...executionContext,
		getNodeParameter: (name: string, fallback: unknown) => {
			if (name === 'inputType') {
				expect(fallback).toBe('inputFile');
				return inputType;
			}
			if (name === 'conversionType') {
				expect(fallback).toBe('');
				return conversionType;
			}
			if (name === 'jobOptionsInputType') {
				expect(fallback).toBe('none');
				return 'none';
			}
			throw new Error(`Unexpected parameter ${name}`);
		},
	} as unknown as IExecuteSingleFunctions;
}

describe('Convert to PDF operation', () => {
	it('uses the OpenAPI operation identity and JSON default route', () => {
		expect(convertToPdfOperation).toMatchObject({
			name: 'Convert Supported Files to PDF',
			value: 'convertToPdf',
			action: 'Convert · File or Webpage to PDF',
			routing: {
				request: {
					method: 'POST',
					url: '/pdf',
					headers: { 'Content-Type': 'application/json' },
				},
			},
		});
	});

	it('shows supported input files as one list below the Operation field', () => {
		expect(convertToPdfDescription[0]).toMatchObject({
			displayName:
				'Supported Input Files<ul><li>Microsoft Office: Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx)</li><li>Documents: PostScript or EPS (.ps/.eps), Email (.eml), HTML (.html), Markdown (.md/.markdown), Plain Text (.txt)</li><li>Structured Data: CSV (.csv), JSON (.json), XML (.xml)</li><li>Images: BMP (.bmp), JPEG (.jpg/.jpeg), PNG (.png), TIFF (.tif/.tiff)</li></ul>',
			name: 'supportedInputFilesNotice',
			type: 'notice',
			default: '',
			displayOptions: { show: { operation: ['convertToPdf'] } },
		});
		expect(
			convertToPdfDescription.filter(({ name }) => name === 'supportedInputFilesNotice'),
		).toHaveLength(1);
		expect(convertToPdfDescription).not.toContainEqual(
			expect.objectContaining({ type: 'callout' }),
		);
	});

	it('exposes file, Resource ID, and URL input-source branches', () => {
		expect(getField('inputType')).toMatchObject({
			displayName: 'Input Source',
			type: 'options',
			noDataExpression: true,
			options: [
				{ name: 'Input File', value: 'inputFile' },
				{ name: 'Resource ID', value: 'resourceId' },
				{ name: 'URL', value: 'url' },
			],
			default: 'inputFile',
			displayOptions: { show: { operation: ['convertToPdf'] } },
		});
		expect(getField('inputFileDataFieldName')).toMatchObject({
			displayName: 'Input File Data Field Name',
			displayOptions: { show: { operation: ['convertToPdf'], inputType: ['inputFile'] } },
			routing: { send: { type: 'body', property: 'file' } },
		});
		expect(getField('resourceId')).toMatchObject({
			displayName: 'Resource ID',
			type: 'string',
			default: '',
			required: true,
			displayOptions: {
				show: { operation: ['convertToPdf'], inputType: ['resourceId'] },
			},
			routing: { send: { type: 'body', property: 'id' } },
		});
		expect(getField('url')).toMatchObject({
			displayName: 'URL',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { operation: ['convertToPdf'], inputType: ['url'] } },
			routing: { send: { type: 'body', property: 'url' } },
		});
		expect(getField('url')?.routing?.send?.preSend).toHaveLength(1);
	});

	it('uses a routing-free input-format selector for progressive disclosure', () => {
		expect(getField('conversionType')).toMatchObject({
			displayName: 'Input Format',
			type: 'options',
			noDataExpression: true,
			options: [
				{ name: 'CSV (.csv)', value: 'csv' },
				{ name: 'HTML (.html)', value: 'html' },
				{ name: 'JSON (.json)', value: 'json' },
				{ name: 'Markdown (.md/.markdown)', value: 'markdown' },
				{ name: 'Microsoft Excel (.xls/.xlsx)', value: 'excel' },
				{ name: 'Microsoft PowerPoint (.ppt/.pptx)', value: 'powerpoint' },
				{ name: 'Microsoft Word (.doc/.docx)', value: 'word' },
				{ name: 'Not Specified', value: '' },
				{ name: 'Plain Text (.txt)', value: 'plainText' },
				{ name: 'PostScript or EPS (.ps/.eps)', value: 'postscript' },
				{ name: 'XML (.xml)', value: 'xml' },
			],
			default: '',
			routing: { send: {} },
		});
		expect(getField('conversionType')?.required).toBeUndefined();
		expect(getField('conversionType')?.description).toBe(
			'Select the input format to choose which format-specific optional fields are available. Leave this field set to Not Specified for images, email, or when you do not need those fields.',
		);
		expect(getField('conversionType')?.routing?.send?.type).toBeUndefined();
		expect(getField('conversionType')?.routing?.send?.property).toBeUndefined();
		expect(getField('conversionType')?.routing?.send?.preSend).toHaveLength(1);
	});

	it('offers custom job options only for PostScript or EPS file inputs', () => {
		expect(getField('jobOptionsInputType')).toMatchObject({
			displayName: 'Job Options Input Source',
			default: 'none',
			options: [
				{ name: 'None', value: 'none' },
				{ name: 'Input File', value: 'inputFile' },
				{ name: 'Resource ID', value: 'resourceId' },
			],
			displayOptions: {
				show: {
					operation: ['convertToPdf'],
					conversionType: ['postscript'],
					inputType: ['inputFile', 'resourceId'],
				},
			},
		});
		expect(getField('jobOptionsFileDataFieldName')).toMatchObject({
			displayName: 'Job Options Input File Data Field Name',
			routing: { send: { type: 'body', property: 'job_options' } },
		});
		expect(getField('jobOptionsResourceId')).toMatchObject({
			displayName: 'Job Options Resource ID',
			routing: { send: { type: 'body', property: 'job_options_id' } },
		});
	});

	it('declares every optional request field in display-label order', () => {
		expect(getField('options')).toMatchObject({
			displayName: 'Optional Fields',
			type: 'collection',
			default: {},
			displayOptions: { show: { operation: ['convertToPdf'] } },
		});
		expect(getField('options')?.options?.map(({ name }) => name)).toEqual([
			'compression',
			'downsample',
			'includeFileInfo',
			'imageFileDataFieldNames',
			'imageResourceIds',
			'locale',
			'output',
			'pageMargin',
			'pageOrientation',
			'pageSize',
			'responseType',
			'structuredTextOptions',
			'taggedPdf',
			'webLayout',
		]);
	});

	it('maps common PostScript, Microsoft Office, and HTML options', () => {
		const visibility = {
			'/conversionType': ['excel', 'html', 'powerpoint', 'postscript', 'word'],
		};
		expect(getOptionalField('compression')).toMatchObject({
			type: 'options',
			options: [
				{ name: 'Lossless', value: 'lossless' },
				{ name: 'Lossy', value: 'lossy' },
			],
			default: 'lossy',
			displayOptions: { show: visibility },
			routing: { send: { type: 'body', property: 'compression' } },
		});
		expect(getOptionalField('downsample')).toMatchObject({
			type: 'options',
			options: [
				{ name: '75 DPI', value: '75' },
				{ name: '150 DPI', value: '150' },
				{ name: '300 DPI', value: '300' },
				{ name: '600 DPI', value: '600' },
				{ name: '1200 DPI', value: '1200' },
				{ name: 'Off', value: 'off' },
			],
			default: '300',
			displayOptions: { show: visibility },
			routing: { send: { type: 'body', property: 'downsample' } },
		});
	});

	it('maps Microsoft Office, structured-text, and Excel-only options', () => {
		expect(getOptionalField('taggedPdf')).toMatchObject({
			type: 'options',
			options: [
				{ name: 'Off', value: 'off' },
				{ name: 'On', value: 'on' },
			],
			default: 'off',
			displayOptions: {
				show: {
					'/conversionType': [
						'csv',
						'excel',
						'json',
						'markdown',
						'plainText',
						'powerpoint',
						'word',
						'xml',
					],
				},
			},
			routing: { send: { type: 'body', property: 'tagged_pdf' } },
		});
		expect(getOptionalField('locale')).toMatchObject({
			type: 'options',
			options: [
				{ name: 'Germany', value: 'Germany' },
				{ name: 'United States', value: 'US' },
			],
			default: 'US',
			displayOptions: { show: { '/conversionType': ['excel'] } },
			routing: { send: { type: 'body', property: 'locale' } },
		});
	});

	it('maps every HTML and structured-text page option, default, enum, and pattern hint', () => {
		const pageVisibility = {
			'/conversionType': ['csv', 'html', 'json', 'markdown', 'plainText', 'xml'],
		};
		expect(getOptionalField('pageMargin')).toMatchObject({
			type: 'string',
			default: '1in',
			placeholder: 'e.g. 8mm or 2.5in',
			displayOptions: { show: pageVisibility },
			routing: { send: { type: 'body', property: 'page_margin' } },
		});
		expect(getOptionalField('pageOrientation')).toMatchObject({
			options: [
				{ name: 'Landscape', value: 'landscape' },
				{ name: 'Portrait', value: 'portrait' },
			],
			default: 'portrait',
			displayOptions: { show: pageVisibility },
			routing: { send: { type: 'body', property: 'page_orientation' } },
		});
		expect(getOptionalField('pageSize')).toMatchObject({
			options: [
				{ name: 'A3', value: 'A3' },
				{ name: 'A4', value: 'A4' },
				{ name: 'A5', value: 'A5' },
				{ name: 'Ledger', value: 'ledger' },
				{ name: 'Legal', value: 'legal' },
				{ name: 'Letter', value: 'letter' },
			],
			default: 'letter',
			displayOptions: { show: pageVisibility },
			routing: { send: { type: 'body', property: 'page_size' } },
		});
		expect(getOptionalField('webLayout')).toMatchObject({
			options: [
				{ name: 'Desktop', value: 'desktop' },
				{ name: 'Mobile', value: 'mobile' },
				{ name: 'Tablet', value: 'tablet' },
			],
			default: 'desktop',
			displayOptions: { show: { '/conversionType': ['html'] } },
			routing: { send: { type: 'body', property: 'web_layout' } },
		});
	});

	it('maps structured-text JSON and Markdown image inputs', () => {
		const structuredVisibility = {
			'/conversionType': ['csv', 'json', 'markdown', 'plainText', 'xml'],
		};
		expect(getOptionalField('structuredTextOptions')).toMatchObject({
			displayName: 'Structured Text Options',
			type: 'json',
			displayOptions: { show: structuredVisibility },
			routing: { send: { type: 'body', property: 'structured_text_options' } },
		});
		const structuredTextOptionsDefault = String(getOptionalField('structuredTextOptions')?.default);
		expect(structuredTextOptionsDefault).toContain('\n');
		expect(JSON.parse(structuredTextOptionsDefault)).toEqual({
			title: 'Quarterly service summary',
			language: 'en-US',
			enable_tagging: true,
		});
		expect(getOptionalField('structuredTextOptionsNotice')).toBeUndefined();
		expect(getField('structuredTextOptionsNotice')).toMatchObject({
			displayName:
				'Structured Text Options documentation: <a href="https://docs.pdfrest.com/pdfrest-api-toolkit-cloud/api-reference-guide/tool/convert-to-pdf/POST/pdf.body.structured_text_options/" target="_blank">Learn how to build the object</a>',
			type: 'notice',
			default: '',
			displayOptions: {
				show: {
					operation: ['convertToPdf'],
					conversionType: ['csv', 'json', 'markdown', 'plainText', 'xml'],
					'/options.structuredTextOptions': [{ _cnd: { exists: true } }],
				},
			},
		});
		expect(getOptionalField('imageFileDataFieldNames')).toMatchObject({
			displayName: 'Image Input File Data Field Name',
			type: 'string',
			typeOptions: {
				multipleValues: true,
				multipleValueButtonText: 'Add Image Input File Data Field Name',
			},
			default: [],
			displayOptions: { show: { '/conversionType': ['markdown'] } },
			routing: { send: { type: 'body', property: 'image_files' } },
		});
		expect(getOptionalField('imageResourceIds')).toMatchObject({
			typeOptions: {
				multipleValues: true,
				multipleValueButtonText: 'Add Image Resource ID',
			},
			default: [],
			displayOptions: { show: { '/conversionType': ['markdown'] } },
			routing: { send: { type: 'body', property: 'image_ids' } },
		});
	});

	it('couples the documentation notice to the selected structured-text field', () => {
		const notice = getField('structuredTextOptionsNotice');
		const isVisible = (conversionType: string, options: Record<string, unknown>) =>
			displayParameter(
				{ operation: 'convertToPdf', conversionType, options },
				notice!,
				null,
				undefined,
			);

		expect(isVisible('markdown', {})).toBe(false);
		expect(isVisible('markdown', { structuredTextOptions: '{"title":"Example"}' })).toBe(true);
		expect(isVisible('html', { structuredTextOptions: '{"title":"Example"}' })).toBe(false);
	});

	it('changes format-specific optional fields with the selected input format', () => {
		const optionsWithoutFormatSpecificFields = ['includeFileInfo', 'output', 'responseType'];
		expect(getVisibleOptionalFieldNames('')).toEqual(optionsWithoutFormatSpecificFields);
		expect(getVisibleOptionalFieldNames('html')).toEqual([
			'compression',
			'downsample',
			'includeFileInfo',
			'output',
			'pageMargin',
			'pageOrientation',
			'pageSize',
			'responseType',
			'webLayout',
		]);
		expect(getVisibleOptionalFieldNames('markdown')).toEqual([
			'includeFileInfo',
			'imageFileDataFieldNames',
			'imageResourceIds',
			'output',
			'pageMargin',
			'pageOrientation',
			'pageSize',
			'responseType',
			'structuredTextOptions',
			'taggedPdf',
		]);
		for (const conversionType of ['csv', 'json', 'plainText', 'xml']) {
			expect(getVisibleOptionalFieldNames(conversionType)).toEqual([
				'includeFileInfo',
				'output',
				'pageMargin',
				'pageOrientation',
				'pageSize',
				'responseType',
				'structuredTextOptions',
				'taggedPdf',
			]);
		}
		expect(getVisibleOptionalFieldNames('excel')).toEqual([
			'compression',
			'downsample',
			'includeFileInfo',
			'locale',
			'output',
			'responseType',
			'taggedPdf',
		]);
		for (const conversionType of ['powerpoint', 'word']) {
			expect(getVisibleOptionalFieldNames(conversionType)).toEqual([
				'compression',
				'downsample',
				'includeFileInfo',
				'output',
				'responseType',
				'taggedPdf',
			]);
		}
		expect(getVisibleOptionalFieldNames('postscript')).toEqual([
			'compression',
			'downsample',
			'includeFileInfo',
			'output',
			'responseType',
		]);
	});

	it('removes all inactive defaults for each format branch', async () => {
		const preSend = getField('conversionType')?.routing?.send?.preSend?.[0];
		const allOptions = {
			compression: 'lossy',
			downsample: '300',
			locale: 'US',
			tagged_pdf: 'off',
			page_margin: '1in',
			page_orientation: 'portrait',
			page_size: 'letter',
			web_layout: 'desktop',
			structured_text_options: { title: 'Example' },
			image_files: ['logo'],
			image_ids: ['resource-image-id'],
		};

		for (const [conversionType, expectedOptions] of [
			['', {}],
			['excel', { compression: 'lossy', downsample: '300', locale: 'US', tagged_pdf: 'off' }],
			[
				'html',
				{
					compression: 'lossy',
					downsample: '300',
					page_margin: '1in',
					page_orientation: 'portrait',
					page_size: 'letter',
					web_layout: 'desktop',
				},
			],
			['postscript', { compression: 'lossy', downsample: '300' }],
			['powerpoint', { compression: 'lossy', downsample: '300', tagged_pdf: 'off' }],
			['word', { compression: 'lossy', downsample: '300', tagged_pdf: 'off' }],
			[
				'json',
				{
					page_margin: '1in',
					page_orientation: 'portrait',
					page_size: 'letter',
					structured_text_options: { title: 'Example' },
					tagged_pdf: 'off',
				},
			],
		] as const) {
			const request: IHttpRequestOptions = {
				url: '/pdf',
				body: { id: 'resource-id', conversionType, ...allOptions },
			};
			await preSend?.call(branchContext('resourceId', conversionType), request);
			expect(request.body).toEqual({ id: 'resource-id', ...expectedOptions });
		}
	});

	it('keeps only the selected PostScript job options branch', async () => {
		const preSend = getField('conversionType')?.routing?.send?.preSend?.[0];
		const withJobOptions = (jobOptionsInputType: string) =>
			({
				...executionContext,
				getNodeParameter: (name: string, fallback: unknown) =>
					({
						inputType: 'resourceId',
						conversionType: 'postscript',
						jobOptionsInputType,
					})[name as 'inputType' | 'conversionType' | 'jobOptionsInputType'] ?? fallback,
			}) as IExecuteSingleFunctions;
		const resourceRequest: IHttpRequestOptions = {
			url: '/pdf',
			body: { id: 'source-id', job_options: 'stale', job_options_id: 'profile-id' },
		};
		await preSend?.call(withJobOptions('resourceId'), resourceRequest);
		expect(resourceRequest.body).toEqual({ id: 'source-id', job_options_id: 'profile-id' });
		await expect(
			preSend?.call(withJobOptions('resourceId'), {
				url: '/pdf',
				body: { id: 'source-id', job_options_id: '' },
			}),
		).rejects.toThrow('Job Options Resource ID is required');
		const inactiveRequest: IHttpRequestOptions = {
			url: '/pdf',
			body: { id: 'source-id', job_options_id: 'stale', job_options: 'stale' },
		};
		await preSend?.call(branchContext('resourceId', 'word'), inactiveRequest);
		expect(inactiveRequest.body).toEqual({ id: 'source-id' });
	});

	it('sends uploaded job options as multipart with the PostScript input', async () => {
		const parameters: Record<string, string> = {
			inputType: 'inputFile',
			conversionType: 'postscript',
			jobOptionsInputType: 'inputFile',
			inputFileDataFieldName: 'source',
			jobOptionsFileDataFieldName: 'profile',
		};
		const context = {
			...executionContext,
			getNodeParameter: (name: string, fallback?: unknown) => parameters[name] ?? fallback,
			helpers: {
				assertBinaryData: (name: string) => ({
					fileName: name === 'source' ? 'input.ps' : 'custom.joboptions',
					mimeType: 'application/octet-stream',
				}),
				getBinaryDataBuffer: async (name: string) => Buffer.from(name),
			},
		} as unknown as IExecuteSingleFunctions;
		const request: IHttpRequestOptions = {
			url: '/pdf',
			headers: { 'Content-Type': 'application/json' },
			body: { file: 'source', job_options: 'profile', job_options_id: 'stale' },
		};
		await getField('conversionType')?.routing?.send?.preSend?.[0]?.call(context, request);
		await getField('inputFileDataFieldName')?.routing?.send?.preSend?.[0]?.call(context, request);
		await getField('jobOptionsFileDataFieldName')?.routing?.send?.preSend?.[0]?.call(
			context,
			request,
		);
		await createDeferredMultipartUploadsPreSend().call(context, request);
		const body = request.body as FormData;
		expect(body.get('file')).toBeInstanceOf(Blob);
		expect(body.get('job_options')).toBeInstanceOf(Blob);
		expect(body.has('job_options_id')).toBe(false);
		expect(request.headers).not.toHaveProperty('Content-Type');
	});

	it('accepts typed structured-text JSON and rejects non-object values', async () => {
		const preSend = getField('conversionType')?.routing?.send?.preSend?.[0];
		for (const structuredTextOptions of [
			{ title: 'Quarterly summary', enable_tagging: true },
			'{"plain_text":{"line_handling":"preserve"}}',
		]) {
			const request: IHttpRequestOptions = {
				url: '/pdf',
				body: { id: 'resource-id', structured_text_options: structuredTextOptions },
			};
			await preSend?.call(branchContext('resourceId', 'plainText'), request);
			expect(request.body).toMatchObject({
				structured_text_options:
					typeof structuredTextOptions === 'string'
						? { plain_text: { line_handling: 'preserve' } }
						: structuredTextOptions,
			});
		}
		await expect(
			preSend?.call(branchContext('resourceId', 'json'), {
				url: '/pdf',
				body: { id: 'resource-id', structured_text_options: '[]' },
			}),
		).rejects.toThrow('Structured Text Options must be a JSON object.');
	});

	it('serializes structured options before adding primary and Markdown image files', async () => {
		const parameters: Record<string, unknown> = {
			inputType: 'inputFile',
			conversionType: 'markdown',
			inputFileDataFieldName: 'document',
			'options.imageFileDataFieldNames': ['logo', 'chart'],
		};
		const context = {
			...executionContext,
			getNodeParameter: (name: string, fallback?: unknown) => parameters[name] ?? fallback,
			helpers: {
				assertBinaryData: (propertyName: string) => ({
					data: '',
					fileName: propertyName === 'document' ? 'document.md' : `${propertyName}.png`,
					mimeType: propertyName === 'document' ? 'text/markdown' : 'image/png',
				}),
				getBinaryDataBuffer: async (propertyName: string) => Buffer.from(propertyName),
			},
		} as unknown as IExecuteSingleFunctions;
		const request: IHttpRequestOptions = {
			url: '/pdf',
			headers: { 'Content-Type': 'application/json' },
			body: {
				file: 'document',
				image_files: ['logo', 'chart'],
				image_ids: ['image-resource-id'],
				structured_text_options: {
					markdown: { image_sources: { logo: { upload_index: 0 } } },
				},
			},
		};

		await getField('inputFileDataFieldName')?.routing?.send?.preSend?.[0]?.call(context, request);
		await getField('conversionType')?.routing?.send?.preSend?.[0]?.call(context, request);
		await createDeferredMultipartUploadsPreSend().call(context, request);

		const formData = request.body as unknown as FormData;
		expect(request.headers).toEqual({});
		expect((formData.get('file') as File).name).toBe('document.md');
		expect(formData.getAll('image_files').map((file) => (file as File).name)).toEqual([
			'logo.png',
			'chart.png',
		]);
		expect(formData.getAll('image_ids')).toEqual(['image-resource-id']);
		expect(JSON.parse(formData.get('structured_text_options') as string)).toEqual({
			markdown: { image_sources: { logo: { upload_index: 0 } } },
		});
	});

	it('constructs URL requests as multipart and cleans their HTML branch', async () => {
		const request: IHttpRequestOptions = {
			url: '/pdf',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
			body: {
				id: 'stale-id',
				url: 'https://example.com/page',
				compression: 'lossless',
				downsample: '150',
				locale: 'Germany',
				tagged_pdf: 'on',
				page_margin: '8mm',
				page_orientation: 'landscape',
				page_size: 'A4',
				web_layout: 'tablet',
			},
		};
		await getField('url')?.routing?.send?.preSend?.[0]?.call(executionContext, request);
		expect(request.body).toBeInstanceOf(FormData);
		await getField('conversionType')?.routing?.send?.preSend?.[0]?.call(
			branchContext('url', 'html'),
			request,
		);

		const formData = request.body as unknown as FormData;
		expect(request.headers).toEqual({ Accept: 'application/json' });
		expect(formData.get('url')).toBe('https://example.com/page');
		expect(formData.get('id')).toBeNull();
		expect(formData.get('locale')).toBeNull();
		expect(formData.get('tagged_pdf')).toBeNull();
		expect(Object.fromEntries(formData.entries())).toMatchObject({
			compression: 'lossless',
			downsample: '150',
			page_margin: '8mm',
			page_orientation: 'landscape',
			page_size: 'A4',
			web_layout: 'tablet',
		});
	});

	it('accepts both declared downsample types and validates typed expressions', async () => {
		const preSend = getField('conversionType')?.routing?.send?.preSend?.[0];
		for (const downsample of ['off', '75', '150', '300', '600', '1200', 75, 150, 300, 600, 1200]) {
			const request: IHttpRequestOptions = {
				url: '/pdf',
				body: { id: 'resource-id', downsample },
			};
			await expect(preSend?.call(branchContext('resourceId', 'word'), request)).resolves.toBe(
				request,
			);
		}
		await expect(
			preSend?.call(branchContext('resourceId', 'word'), {
				url: '/pdf',
				body: { id: 'resource-id', downsample: 100 },
			}),
		).rejects.toThrow('Downsample has an invalid value.');
	});

	it('validates URI, page-margin pattern, and enum expressions', async () => {
		const preSend = getField('conversionType')?.routing?.send?.preSend?.[0];
		await expect(
			preSend?.call(branchContext('url', 'html'), {
				url: '/pdf',
				body: { url: 'not a uri' },
			}),
		).rejects.toThrow('URL must be a valid URI.');
		await expect(
			preSend?.call(branchContext('resourceId', 'html'), {
				url: '/pdf',
				body: { id: 'resource-id', page_margin: '12px' },
			}),
		).rejects.toThrow('Page Margin');
		await expect(
			preSend?.call(branchContext('resourceId', 'html'), {
				url: '/pdf',
				body: { id: 'resource-id', web_layout: 'watch' },
			}),
		).rejects.toThrow('Web Layout has an invalid value.');
	});

	it('validates output and routes both inherited headers', async () => {
		const output = getOptionalField('output');
		expect(output).toMatchObject({
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'output' } },
		});
		await expect(
			output?.routing?.send?.preSend?.[0]?.call(executionContext, {
				url: '/pdf',
				body: { output: '' },
			}),
		).rejects.toThrow('Output File Name must contain at least one character.');

		const includeRequest: IHttpRequestOptions = { url: '/pdf' };
		await getOptionalField('includeFileInfo')?.routing?.send?.preSend?.[0]?.call(
			{ getNodeParameter: () => false } as unknown as IExecuteSingleFunctions,
			includeRequest,
		);
		expect(includeRequest.headers).toEqual({ 'Include-File-Info': false });

		const responseRequest: IHttpRequestOptions = {
			url: '/pdf',
			headers: { Accept: 'application/json', 'Response-Type': 'requestId' },
		};
		await getOptionalField('responseType')?.routing?.send?.preSend?.[0]?.call(
			{ getNodeParameter: () => '' } as unknown as IExecuteSingleFunctions,
			responseRequest,
		);
		expect(responseRequest.headers).toEqual({ Accept: 'application/json' });
	});

	it('routes every representable body property, including multipart file input', () => {
		const publicDefinition = JSON.stringify(convertToPdfDescription);
		expect(publicDefinition).toContain('inputFileDataFieldName');
		expect(publicDefinition).toContain('"property":"file"');

		const bodyProperties = convertToPdfDescription.flatMap((field) => [
			...(field.routing?.send?.type === 'body' ? [field.routing.send.property] : []),
			...(field.options ?? []).flatMap((option) =>
				option.routing?.send?.type === 'body' ? [option.routing.send.property] : [],
			),
		]);
		expect(bodyProperties).toEqual([
			'id',
			'file',
			'url',
			'job_options_id',
			'job_options',
			'compression',
			'downsample',
			'image_files',
			'image_ids',
			'locale',
			'output',
			'page_margin',
			'page_orientation',
			'page_size',
			'structured_text_options',
			'tagged_pdf',
			'web_layout',
		]);
	});
});
