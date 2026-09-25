import {
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodePropertyOptions,
	type PreSendAction,
} from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createIncludeFileInfoField, createResponseTypeField } from '../helpers/headers';
import { createInputSourceFields, createSecondaryFileInputSourceFields } from '../helpers/inputSource';
import { createDeferredMultipartUploadPreSend } from '../helpers/multipart';

type ConversionType =
	| ''
	| 'csv'
	| 'excel'
	| 'html'
	| 'json'
	| 'markdown'
	| 'plainText'
	| 'postscript'
	| 'powerpoint'
	| 'word'
	| 'xml';
type InputType = 'inputFile' | 'resourceId' | 'url';
type JobOptionsInputType = 'none' | 'inputFile' | 'resourceId';

const structuredTextOptionsExample = JSON.stringify(
	{
		title: 'Quarterly service summary',
		language: 'en-US',
		enable_tagging: true,
	},
	null,
	2,
);

const conversionTypes: readonly ConversionType[] = [
	'',
	'csv',
	'excel',
	'html',
	'json',
	'markdown',
	'plainText',
	'postscript',
	'powerpoint',
	'word',
	'xml',
];
const officeConversionTypes: readonly ConversionType[] = ['excel', 'powerpoint', 'word'];
const structuredTextConversionTypes: readonly ConversionType[] = [
	'csv',
	'json',
	'markdown',
	'plainText',
	'xml',
];
const optimizationConversionTypes: readonly ConversionType[] = [
	...officeConversionTypes,
	'html',
	'postscript',
];
const optimizationProperties = ['compression', 'downsample'] as const;
const taggedPdfProperties = ['tagged_pdf'] as const;
const excelProperties = ['locale'] as const;
const htmlProperties = ['page_margin', 'page_orientation', 'page_size', 'web_layout'] as const;
const structuredTextProperties = [
	'page_margin',
	'page_orientation',
	'page_size',
	'structured_text_options',
] as const;
const markdownProperties = ['image_files', 'image_ids'] as const;
const jobOptionsProperties = ['job_options', 'job_options_id'] as const;
const allFormatProperties = [
	...optimizationProperties,
	...taggedPdfProperties,
	...excelProperties,
	...htmlProperties,
	...structuredTextProperties,
	...markdownProperties,
	...jobOptionsProperties,
] as const;

function normalizeStructuredTextOptions(
	context: Pick<IExecuteSingleFunctions, 'getNode'>,
	body: IHttpRequestOptions['body'],
): void {
	const rawValue = getBodyValue(body, 'structured_text_options');
	if (rawValue === undefined) return;

	try {
		const value = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			throw new Error('Structured Text Options must be a JSON object.');
		}
		if (body instanceof FormData) {
			body.set('structured_text_options', JSON.stringify(value));
		} else if (body && typeof body === 'object' && !Array.isArray(body) && !Buffer.isBuffer(body)) {
			(body as IDataObject).structured_text_options = value as IDataObject;
		}
	} catch (error) {
		throw new NodeOperationError(
			context.getNode(),
			error instanceof Error ? error.message : 'Structured Text Options contains invalid JSON.',
		);
	}
}

function getBodyValue(body: IHttpRequestOptions['body'], property: string): unknown {
	if (body instanceof FormData) return body.get(property) ?? undefined;
	if (body && typeof body === 'object' && !Array.isArray(body) && !Buffer.isBuffer(body)) {
		return (body as IDataObject)[property];
	}
	return undefined;
}

function deleteBodyProperty(body: IHttpRequestOptions['body'], property: string): void {
	if (body instanceof FormData) {
		body.delete(property);
	} else if (body && typeof body === 'object' && !Array.isArray(body) && !Buffer.isBuffer(body)) {
		delete (body as IDataObject)[property];
	}
}

function validateEnum(
	context: Pick<IExecuteSingleFunctions, 'getNode'>,
	body: IHttpRequestOptions['body'],
	property: string,
	displayName: string,
	allowedValues: readonly (number | string)[],
): void {
	const value = getBodyValue(body, property);
	if (value !== undefined && !allowedValues.includes(value as number | string)) {
		throw new NodeOperationError(context.getNode(), `${displayName} has an invalid value.`);
	}
}

function createConvertToPdfPreSend(): PreSendAction {
	return async function prepareConvertToPdfRequest(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const inputType = this.getNodeParameter('inputType', 'inputFile') as InputType;
		const conversionType = this.getNodeParameter('conversionType', '') as ConversionType;
		const body = requestOptions.body;
		deleteBodyProperty(body, 'conversionType');

		if (inputType === 'inputFile') {
			deleteBodyProperty(body, 'id');
			deleteBodyProperty(body, 'url');
		} else if (inputType === 'resourceId') {
			deleteBodyProperty(body, 'url');
			const resourceId = getBodyValue(body, 'id');
			if (typeof resourceId !== 'string' || resourceId.length < 1) {
				throw new NodeOperationError(this.getNode(), 'Resource ID is required.');
			}
		} else if (inputType === 'url') {
			deleteBodyProperty(body, 'id');
			const url = getBodyValue(body, 'url');
			if (typeof url !== 'string' || url.length < 1) {
				throw new NodeOperationError(this.getNode(), 'URL is required.');
			}
			try {
				new URL(url);
			} catch {
				throw new NodeOperationError(this.getNode(), 'URL must be a valid URI.');
			}
		} else {
			throw new NodeOperationError(this.getNode(), 'Input Source has an invalid value.');
		}

		if (!conversionTypes.includes(conversionType)) {
			throw new NodeOperationError(this.getNode(), 'Input Format has an invalid value.');
		}
		const activeProperties = new Set<string>();
		if (optimizationConversionTypes.includes(conversionType)) {
			optimizationProperties.forEach((property) => activeProperties.add(property));
		}
		if (
			officeConversionTypes.includes(conversionType) ||
			structuredTextConversionTypes.includes(conversionType)
		) {
			taggedPdfProperties.forEach((property) => activeProperties.add(property));
		}
		if (conversionType === 'excel') {
			excelProperties.forEach((property) => activeProperties.add(property));
		}
		if (conversionType === 'html') {
			htmlProperties.forEach((property) => activeProperties.add(property));
		}
		if (structuredTextConversionTypes.includes(conversionType)) {
			structuredTextProperties.forEach((property) => activeProperties.add(property));
		}
		if (conversionType === 'markdown') {
			markdownProperties.forEach((property) => activeProperties.add(property));
		}
		if (conversionType === 'postscript' && inputType !== 'url') {
			jobOptionsProperties.forEach((property) => activeProperties.add(property));
		}

		for (const property of allFormatProperties) {
			if (!activeProperties.has(property)) deleteBodyProperty(body, property);
		}
		if (conversionType === 'postscript' && inputType !== 'url') {
			const jobOptionsInputType = this.getNodeParameter(
				'jobOptionsInputType',
				'none',
			) as JobOptionsInputType;
			if (jobOptionsInputType === 'none') {
				deleteBodyProperty(body, 'job_options');
				deleteBodyProperty(body, 'job_options_id');
			} else if (jobOptionsInputType === 'inputFile') {
				deleteBodyProperty(body, 'job_options_id');
			} else if (jobOptionsInputType === 'resourceId') {
				deleteBodyProperty(body, 'job_options');
				const jobOptionsId = getBodyValue(body, 'job_options_id');
				if (typeof jobOptionsId !== 'string' || jobOptionsId.trim().length === 0) {
					throw new NodeOperationError(this.getNode(), 'Job Options Resource ID is required.');
				}
			} else {
				throw new NodeOperationError(this.getNode(), 'Job Options Input Source has an invalid value.');
			}
		}

		if (structuredTextConversionTypes.includes(conversionType)) {
			normalizeStructuredTextOptions(this, body);
		}
		if (conversionType === 'markdown' && getBodyValue(body, 'image_files') !== undefined) {
			await createDeferredMultipartUploadPreSend({
				binaryDataPropertyNameParameter: 'options.imageFileDataFieldNames',
				fileFieldName: 'image_files',
			}).call(this, requestOptions);
		}

		validateEnum(this, body, 'compression', 'Compression', ['lossless', 'lossy']);
		validateEnum(this, body, 'downsample', 'Downsample', [
			'off',
			'75',
			'150',
			'300',
			'600',
			'1200',
			75,
			150,
			300,
			600,
			1200,
		]);
		validateEnum(this, body, 'tagged_pdf', 'Tagged PDF', ['off', 'on']);
		validateEnum(this, body, 'locale', 'Locale', ['Germany', 'US']);
		validateEnum(this, body, 'page_size', 'Page Size', [
			'letter',
			'legal',
			'ledger',
			'A3',
			'A4',
			'A5',
		]);
		validateEnum(this, body, 'page_orientation', 'Page Orientation', ['landscape', 'portrait']);
		validateEnum(this, body, 'web_layout', 'Web Layout', ['desktop', 'mobile', 'tablet']);

		const pageMargin = getBodyValue(body, 'page_margin');
		if (
			pageMargin !== undefined &&
			(typeof pageMargin !== 'string' || !/^[0-9]+(?:\.[0-9]+)?(?:in|mm)$/.test(pageMargin))
		) {
			throw new NodeOperationError(
				this.getNode(),
				'Page Margin must be a non-negative number followed by in or mm.',
			);
		}

		const output = getBodyValue(body, 'output');
		if (output !== undefined && (typeof output !== 'string' || output.length < 1)) {
			throw new NodeOperationError(
				this.getNode(),
				'Output File Name must contain at least one character.',
			);
		}

		return requestOptions;
	};
}

export const convertToPdfOperation: INodePropertyOptions = {
	name: 'Convert Supported Files to PDF',
	value: 'convertToPdf',
	action: 'Convert · File or Webpage to PDF',
	description:
		'Convert supported office, image, PostScript, email, HTML, or structured-text content to PDF',
	routing: {
		request: {
			method: 'POST',
			url: '/pdf',
			headers: {
				'Content-Type': 'application/json',
			},
		},
	},
};

export const convertToPdfDescription: INodeProperties[] = [
	{
		displayName:
			'Supported Input Files<ul><li>Microsoft Office: Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx)</li><li>Documents: PostScript or EPS (.ps/.eps), Email (.eml), HTML (.html), Markdown (.md/.markdown), Plain Text (.txt)</li><li>Structured Data: CSV (.csv), JSON (.json), XML (.xml)</li><li>Images: BMP (.bmp), JPEG (.jpg/.jpeg), PNG (.png), TIFF (.tif/.tiff)</li></ul>',
		name: 'supportedInputFilesNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { operation: ['convertToPdf'] } },
	},
	...createInputSourceFields({
		operation: 'convertToPdf',
		sources: ['file', 'resourceId', 'url'],
		file: { deferUpload: true },
		url: { requestFormat: 'multipart' },
	}),
	{
		displayName: 'Input Format',
		name: 'conversionType',
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
		displayOptions: { show: { operation: ['convertToPdf'] } },
		description:
			'Select the input format to choose which format-specific optional fields are available. Leave this field set to Not Specified for images, email, or when you do not need those fields.',
		routing: { send: { preSend: [createConvertToPdfPreSend()] } },
	},
	...createSecondaryFileInputSourceFields({
		allowNone: true,
		displayName: 'Job Options Input Source',
		operation: 'convertToPdf',
		show: { conversionType: ['postscript'], inputType: ['inputFile', 'resourceId'] },
		inputTypeName: 'jobOptionsInputType',
		fileFieldName: 'job_options',
		fileInputDataFieldName: 'jobOptionsFileDataFieldName',
		fileInputDataFieldDisplayName: 'Job Options Input File Data Field Name',
		resourceIdName: 'jobOptionsResourceId',
		resourceIdDisplayName: 'Job Options Resource ID',
		resourceIdBodyProperty: 'job_options_id',
		resourceIdDescription: 'The resource ID of a previously uploaded .joboptions profile',
	}),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { operation: ['convertToPdf'] } },
		options: [
			{
				displayName: 'Compression',
				name: 'compression',
				type: 'options',
				options: [
					{ name: 'Lossless', value: 'lossless' },
					{ name: 'Lossy', value: 'lossy' },
				],
				default: 'lossy',
				displayOptions: {
					show: {
						'/conversionType': ['excel', 'html', 'powerpoint', 'postscript', 'word'],
					},
				},
				description: 'The image compression used during conversion',
				routing: { send: { type: 'body', property: 'compression' } },
			},
			{
				displayName: 'Downsample',
				name: 'downsample',
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
				displayOptions: {
					show: {
						'/conversionType': ['excel', 'html', 'powerpoint', 'postscript', 'word'],
					},
				},
				description: 'The image resolution or whether to preserve original resolutions',
				routing: { send: { type: 'body', property: 'downsample' } },
			},
			createIncludeFileInfoField('convertToPdf'),
			{
				displayName: 'Image Input File Data Field Name',
				name: 'imageFileDataFieldNames',
				type: 'string',
				typeOptions: {
					multipleValues: true,
					multipleValueButtonText: 'Add Image Input File Data Field Name',
				},
				default: [],
				displayOptions: { show: { '/conversionType': ['markdown'] } },
				description:
					'The ordered input fields containing images referenced by upload indexes in Structured Text Options',
				routing: { send: { type: 'body', property: 'image_files' } },
			},
			{
				displayName: 'Image Resource IDs',
				name: 'imageResourceIds',
				type: 'string',
				typeOptions: {
					multipleValues: true,
					multipleValueButtonText: 'Add Image Resource ID',
				},
				default: [],
				displayOptions: { show: { '/conversionType': ['markdown'] } },
				description:
					'The ordered resource IDs for images referenced by image ID indexes in Structured Text Options',
				routing: { send: { type: 'body', property: 'image_ids' } },
			},
			{
				displayName: 'Locale',
				name: 'locale',
				type: 'options',
				options: [
					{ name: 'Germany', value: 'Germany' },
					{ name: 'United States', value: 'US' },
				],
				default: 'US',
				displayOptions: { show: { '/conversionType': ['excel'] } },
				description: 'The regional formatting used for Microsoft Excel conversion',
				routing: { send: { type: 'body', property: 'locale' } },
			},
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated PDF without an extension',
			}),
			{
				displayName: 'Page Margin',
				name: 'pageMargin',
				type: 'string',
				default: '1in',
				placeholder: 'e.g. 8mm or 2.5in',
				displayOptions: {
					show: { '/conversionType': ['csv', 'html', 'json', 'markdown', 'plainText', 'xml'] },
				},
				description: 'The HTML or structured-text page margin as a number followed by in or mm',
				routing: { send: { type: 'body', property: 'page_margin' } },
			},
			{
				displayName: 'Page Orientation',
				name: 'pageOrientation',
				type: 'options',
				options: [
					{ name: 'Landscape', value: 'landscape' },
					{ name: 'Portrait', value: 'portrait' },
				],
				default: 'portrait',
				displayOptions: {
					show: { '/conversionType': ['csv', 'html', 'json', 'markdown', 'plainText', 'xml'] },
				},
				description: 'The HTML or structured-text page orientation',
				routing: { send: { type: 'body', property: 'page_orientation' } },
			},
			{
				displayName: 'Page Size',
				name: 'pageSize',
				type: 'options',
				options: [
					{ name: 'A3', value: 'A3' },
					{ name: 'A4', value: 'A4' },
					{ name: 'A5', value: 'A5' },
					{ name: 'Ledger', value: 'ledger' },
					{ name: 'Legal', value: 'legal' },
					{ name: 'Letter', value: 'letter' },
				],
				default: 'letter',
				displayOptions: {
					show: { '/conversionType': ['csv', 'html', 'json', 'markdown', 'plainText', 'xml'] },
				},
				description: 'The standard page size for HTML or structured-text conversion',
				routing: { send: { type: 'body', property: 'page_size' } },
			},
			createResponseTypeField('convertToPdf'),
			{
				displayName: 'Structured Text Options',
				name: 'structuredTextOptions',
				type: 'json',
				default: structuredTextOptionsExample,
				displayOptions: {
					show: { '/conversionType': ['csv', 'json', 'markdown', 'plainText', 'xml'] },
				},
				description:
					'Conversion options for document metadata, tagging, page setup, typography, tables, and format-specific behavior',
				routing: { send: { type: 'body', property: 'structured_text_options' } },
			},
			{
				displayName: 'Tagged PDF',
				name: 'taggedPdf',
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
				description:
					'Choose whether Microsoft Office or structured-text conversion creates accessibility tags',
				routing: { send: { type: 'body', property: 'tagged_pdf' } },
			},
			{
				displayName: 'Web Layout',
				name: 'webLayout',
				type: 'options',
				options: [
					{ name: 'Desktop', value: 'desktop' },
					{ name: 'Mobile', value: 'mobile' },
					{ name: 'Tablet', value: 'tablet' },
				],
				default: 'desktop',
				displayOptions: { show: { '/conversionType': ['html'] } },
				description: 'The responsive layout used for an HTML URL',
				routing: { send: { type: 'body', property: 'web_layout' } },
			},
		],
	},
	{
		displayName:
			'Structured Text Options documentation: <a href="https://docs.pdfrest.com/pdfrest-api-toolkit-cloud/api-reference-guide/tool/convert-to-pdf/POST/pdf.body.structured_text_options/" target="_blank">Learn how to build the object</a>',
		name: 'structuredTextOptionsNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: {
				operation: ['convertToPdf'],
				conversionType: ['csv', 'json', 'markdown', 'plainText', 'xml'],
				'/options.structuredTextOptions': [{ _cnd: { exists: true } }],
			},
		},
	},
];
