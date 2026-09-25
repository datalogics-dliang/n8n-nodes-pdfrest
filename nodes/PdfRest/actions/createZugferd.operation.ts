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
			[pdfSource, 'pdf_file', 'pdf_id', 'PDF Input Source'],
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
				? (new Blob([JSON.stringify(parsed)], { type: 'application/json' }) as unknown as IDataObject)
				: (parsed as IDataObject);
		}
		return requestOptions;
	};
}

export const createZugferdOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Create ZUGFeRD PDF',
	value: 'createZugferd',
	action: 'Modify · Create ZUGFeRD PDF',
	description: 'Create a ZUGFeRD or Factur-X invoice PDF from invoice XML',
	path: '/zugferd-pdf',
});

export const createZugferdDescription: INodeProperties[] = [
	...createInputSourceFields({
		operation: 'createZugferd',
		file: {
			deferUpload: true,
			description: 'The input field containing the invoice XML file',
		},
	}),
	...createSecondaryFileInputSourceFields({
		allowNone: true,
		displayName: 'Source PDF Input Source',
		operation: 'createZugferd',
		inputTypeName: 'pdfInputType',
		fileFieldName: 'pdf_file',
		fileInputDataFieldName: 'pdfFileDataFieldName',
		fileInputDataFieldDisplayName: 'Source PDF Input File Data Field Name',
		resourceIdName: 'pdfResourceId',
		resourceIdDisplayName: 'Source PDF Resource ID',
		resourceIdBodyProperty: 'pdf_id',
		resourceIdDescription: 'The resource ID of an existing source PDF',
	}).map((field) =>
		field.name === 'pdfInputType'
			? { ...field, routing: { send: { preSend: [createZugferdRequestPreSend()] } } }
			: field,
	),
	...createSecondaryFileInputSourceFields({
		allowNone: true,
		displayName: 'Logo Input Source',
		operation: 'createZugferd',
		inputTypeName: 'logoInputType',
		fileFieldName: 'logo_file',
		fileInputDataFieldName: 'logoFileDataFieldName',
		fileInputDataFieldDisplayName: 'Logo Input File Data Field Name',
		resourceIdName: 'logoResourceId',
		resourceIdDisplayName: 'Logo Resource ID',
		resourceIdBodyProperty: 'logo_id',
		resourceIdDescription: 'The resource ID of a PNG or JPEG logo',
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
				description: 'Whether to regenerate the visual PDF if it cannot be matched to the XML',
				routing: { send: { type: 'body', property: 'regenerate_pdf' } },
			},
			{
				displayName: 'Render Options',
				name: 'renderOptions',
				type: 'json',
				default: '{}',
				description: 'Appearance and regional formatting options for a generated PDF',
				routing: { send: { type: 'body', property: 'render_options' } },
			},
		],
	},
];
