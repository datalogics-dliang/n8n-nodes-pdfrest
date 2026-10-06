import {
	NodeOperationError,
	type IDataObject,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodePropertyOptions,
	type PreSendAction,
} from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createIncludeFileInfoField, createResponseTypeField } from '../helpers/headers';
import { createInputFileFields } from '../helpers/inputSource';

function createResourceIdsPreSend(): PreSendAction {
	return async function validateResourceIds(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const body = requestOptions.body;
		const resourceIds =
			body && typeof body === 'object' && !Array.isArray(body)
				? (body as IDataObject)['id[]']
				: undefined;

		if (!Array.isArray(resourceIds) || resourceIds.length < 1) {
			throw new NodeOperationError(this.getNode(), 'At least one Resource ID is required.');
		}
		for (const [index, resourceId] of resourceIds.entries()) {
			if (typeof resourceId !== 'string' || resourceId.trim().length < 1) {
				throw new NodeOperationError(
					this.getNode(),
					`Resource ID ${index + 1} must contain at least one character.`,
				);
			}
		}

		return requestOptions;
	};
}

export const zipOperation: INodePropertyOptions = {
	name: 'Compress Files Into ZIP Archive',
	value: 'zip',
	action: 'Files · ZIP Output Files',
	description: 'Combine input files or existing pdfRest resources into a downloadable ZIP archive',
	routing: {
		request: {
			method: 'POST',
			url: '/zip',
			headers: {
				'Content-Type': 'application/json',
			},
		},
	},
};

export const zipDescription: INodeProperties[] = [
	{
		displayName: 'Input Source',
		name: 'inputType',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Input File', value: 'inputFile' },
			{ name: 'Resource ID', value: 'resourceId' },
		],
		default: 'inputFile',
		displayOptions: { show: { operation: ['zip'] } },
		description: 'Choose files from this workflow or files already stored by pdfRest for the ZIP archive',
	},
	{
		displayName: 'Resource IDs',
		name: 'resourceIds',
		type: 'string',
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Resource ID',
		},
		default: [],
		required: true,
		placeholder: 'e.g. 0950b9bd-f046-4d3f-8ea3-d2894f1ae839',
		displayOptions: {
			show: {
				operation: ['zip'],
				inputType: ['resourceId'],
			},
		},
		description: 'The IDs of existing pdfRest resources to include in the ZIP archive',
		routing: {
			send: {
				type: 'body',
				property: 'id[]',
				propertyInDotNotation: false,
				preSend: [createResourceIdsPreSend()],
			},
		},
	},
	...createInputFileFields({
		operation: 'zip',
		file: {
			inputDataFieldName: 'inputFileDataFieldNames',
			multipleValues: true,
			description:
				'The names of the input fields containing the files to include in the ZIP archive',
		},
	}),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				operation: ['zip'],
			},
		},
		options: [
			createIncludeFileInfoField('zip'),
			{
				...createNonEmptyBodyStringField({
					displayName: 'Output File Name',
					name: 'output',
					bodyProperty: 'output',
					description: 'The name of the generated ZIP archive without an extension',
				}),
				default: 'pdfrest_zip',
			},
			createResponseTypeField('zip'),
		],
	},
];
