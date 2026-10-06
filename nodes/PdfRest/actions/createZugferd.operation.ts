import {
	NodeOperationError,
	type IDataObject,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodePropertyOptions,
	type PreSendAction,
} from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createIncludeFileInfoField } from '../helpers/headers';
import { createInputSourceFields, createSecondaryFileInputSourceFields } from '../helpers/inputSource';
import { createResourceIdOperation } from '../helpers/resourceId';

type OptionalSource = 'none' | 'inputFile' | 'resourceId';

const renderOptionsExample = JSON.stringify(
	{
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
	},
	null,
	2,
);

function createZugferdRequestPreSend(): PreSendAction {
	return async function prepareZugferdRequest(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const body = requestOptions.body;
		if (!body || typeof body !== 'object' || Array.isArray(body) || body instanceof FormData) {
			return requestOptions;
		}
		const requestBody = body as IDataObject;
		const pdfSource = this.getNodeParameter('pdfInputType', 'none') as OptionalSource;
		const logoSource = this.getNodeParameter('logoInputType', 'none') as OptionalSource;
		for (const [source, fileKey, idKey, label] of [
			[pdfSource, 'pdf_file', 'pdf_id', 'Source PDF Input Source'],
			[logoSource, 'logo_file', 'logo_id', 'Logo Input Source'],
		] as const) {
			if (source === 'none') {
				delete requestBody[fileKey];
				delete requestBody[idKey];
			} else if (source === 'inputFile') {
				delete requestBody[idKey];
			} else if (source === 'resourceId') {
				delete requestBody[fileKey];
				if (typeof requestBody[idKey] !== 'string' || requestBody[idKey].trim().length === 0) {
					throw new NodeOperationError(this.getNode(), `${label} requires a Resource ID.`);
				}
			} else {
				throw new NodeOperationError(this.getNode(), `${label} has an invalid value.`);
			}
		}
		if (requestBody.regenerate_pdf === true && pdfSource === 'none') {
			throw new NodeOperationError(
				this.getNode(),
				'Regenerate PDF requires a source PDF file or Resource ID.',
			);
		}
		const renderOptions = requestBody.render_options;
		if (renderOptions !== undefined) {
			let parsed: unknown;
			try {
				parsed = typeof renderOptions === 'string' ? JSON.parse(renderOptions) : renderOptions;
			} catch {
				throw new NodeOperationError(this.getNode(), 'Render Options must contain valid JSON.');
			}
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new NodeOperationError(this.getNode(), 'Render Options must be a JSON object.');
			}
			const hasFileInput =
				this.getNodeParameter('inputType', 'inputFile') === 'inputFile' ||
				pdfSource === 'inputFile' ||
				logoSource === 'inputFile';
			requestBody.render_options = hasFileInput
				? JSON.stringify(parsed)
				: (parsed as IDataObject);
		}
		return requestOptions;
	};
}

export const createZugferdOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Create ZUGFeRD / Factur-X PDF Invoice',
	value: 'createZugferd',
	action: 'E-Invoicing · Create ZUGFeRD / Factur-X PDF Invoice',
	description: 'Create a ZUGFeRD or Factur-X invoice PDF from invoice XML',
	path: '/zugferd-pdf',
});

export const createZugferdDescription: INodeProperties[] = [
	...createInputSourceFields({
		operation: 'createZugferd',
		description: 'Choose the required invoice XML file or its pdfRest resource ID',
		resourceIdDescription: 'The resource ID of the invoice XML file',
		file: {
			deferUpload: true,
			description: 'The input field containing the invoice XML file',
		},
	}),
	...createSecondaryFileInputSourceFields({
		allowNone: true,
		displayName: 'Source PDF Input Source',
		description:
			'Choose an existing visual invoice PDF to pair with the XML, or None to generate one from the XML',
		operation: 'createZugferd',
		inputTypeName: 'pdfInputType',
		fileFieldName: 'pdf_file',
		fileInputDataFieldName: 'pdfFileDataFieldName',
		fileInputDataFieldDisplayName: 'Source PDF Input File Data Field Name',
		fileInputDescription: 'The input field containing the existing visual invoice PDF',
		resourceIdName: 'pdfResourceId',
		resourceIdDisplayName: 'Source PDF Resource ID',
		resourceIdBodyProperty: 'pdf_id',
		resourceIdDescription: 'The resource ID of the existing visual invoice PDF',
	}).map((field) =>
		field.name === 'pdfInputType'
			? { ...field, routing: { send: { preSend: [createZugferdRequestPreSend()] } } }
			: field,
	),
	...createSecondaryFileInputSourceFields({
		allowNone: true,
		displayName: 'Logo Input Source',
		description: 'Choose a PNG or JPEG logo for a generated or regenerated PDF, or None to omit it',
		operation: 'createZugferd',
		inputTypeName: 'logoInputType',
		fileFieldName: 'logo_file',
		fileInputDataFieldName: 'logoFileDataFieldName',
		fileInputDataFieldDisplayName: 'Logo Input File Data Field Name',
		fileInputDescription: 'The input field containing the PNG or JPEG logo',
		resourceIdName: 'logoResourceId',
		resourceIdDisplayName: 'Logo Resource ID',
		resourceIdBodyProperty: 'logo_id',
		resourceIdDescription: 'The resource ID of a previously uploaded PNG or JPEG logo',
	}),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { operation: ['createZugferd'] } },
		options: [
			createIncludeFileInfoField('createZugferd'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated invoice PDF without an extension',
			}),
			{
				displayName: 'Regenerate PDF',
				name: 'regeneratePdf',
				type: 'boolean',
				default: false,
				displayOptions: { show: { '/pdfInputType': ['inputFile', 'resourceId'] } },
				description:
				'Whether to generate a replacement visual PDF if the supplied PDF does not match the XML or cannot be fully confirmed',
				routing: { send: { type: 'body', property: 'regenerate_pdf' } },
			},
			{
				displayName: 'Render Options',
				name: 'renderOptions',
				type: 'json',
				default: renderOptionsExample,
				description:
					'A JSON object for generated PDF appearance, such as locale, label_language, font, and accent_color_rgb',
				hint: 'Render Options documentation: <a href="https://docs.pdfrest.com/pdfrest-api-toolkit-cloud/api-reference-guide/tool/create-zugferd-pdf/POST/zugferd-pdf.body.render_options/" target="_blank">Learn how to build the object</a>',
				routing: { send: { type: 'body', property: 'render_options' } },
			},
		],
	},
];
