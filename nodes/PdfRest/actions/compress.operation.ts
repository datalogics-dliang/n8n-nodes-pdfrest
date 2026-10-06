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
import { createSecondaryFileInputSourceFields } from '../helpers/inputSource';
import { createResourceIdField, createResourceIdOperation } from '../helpers/resourceId';

function createCompressionProfilePreSend(): PreSendAction {
	return async function handleCompressionProfile(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const compressionLevel = this.getNodeParameter('compressionLevel', 'medium');
		const profileInputType = this.getNodeParameter('profileInputType', 'inputFile');
		const body = requestOptions.body;

		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return requestOptions;
		}

		if (compressionLevel !== 'custom') {
			const nextBody = { ...(body as IDataObject) };
			delete nextBody.profile_id;
			delete nextBody.profile;
			requestOptions.body = nextBody;
			return requestOptions;
		}

		if (profileInputType === 'inputFile') {
			return requestOptions;
		}

		const profileId = (body as IDataObject).profile_id;
		if (typeof profileId !== 'string' || profileId.length < 1) {
			throw new NodeOperationError(
				this.getNode(),
				'Profile Resource ID is required for custom compression.',
			);
		}

		return requestOptions;
	};
}

function runOnlyForCustomProfileFile(preSend: PreSendAction): PreSendAction {
	return async function handleCompressionProfileFile(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const compressionLevel = this.getNodeParameter('compressionLevel', 'medium');
		const profileInputType = this.getNodeParameter('profileInputType', 'inputFile');

		if (compressionLevel !== 'custom' || profileInputType !== 'inputFile') {
			if (requestOptions.body && typeof requestOptions.body === 'object') {
				const nextBody = { ...(requestOptions.body as IDataObject) };
				delete nextBody.profile;
				requestOptions.body = nextBody;
			}
			return requestOptions;
		}

		return await preSend.call(this, requestOptions);
	};
}

function createCompressionProfileFields(): INodeProperties[] {
	return createSecondaryFileInputSourceFields({
		displayName: 'Profile Input Source',
		description: 'Choose a custom JSON compression profile from this workflow or one already stored by pdfRest',
		operation: 'compress',
		show: { compressionLevel: ['custom'] },
		inputTypeName: 'profileInputType',
		fileFieldName: 'profile',
		fileInputDataFieldName: 'profileFileDataFieldName',
		fileInputDataFieldDisplayName: 'Profile Input File Data Field Name',
		resourceIdName: 'profileId',
		resourceIdDisplayName: 'Profile Resource ID',
		resourceIdBodyProperty: 'profile_id',
		resourceIdDescription: 'The resource ID of a previously uploaded JSON compression profile',
	}).map((field) => {
		if (field.name === 'profileId') {
			return {
				...field,
				required: false,
				description:
					'The resource ID of a previously uploaded JSON profile; required for custom compression when Profile Input Source is Resource ID',
			};
		}
		if (field.name !== 'profileFileDataFieldName') return field;

		const preSend = field.routing?.send?.preSend?.[0];
		return {
			...field,
			required: false,
			description:
				'The name of the input field containing the JSON profile; required for custom compression when Profile Input Source is Input File',
			...(preSend
				? {
						routing: {
							...field.routing,
							send: {
								...field.routing?.send,
								preSend: [runOnlyForCustomProfileFile(preSend)],
							},
						},
					}
				: {}),
		};
	});
}

export const compressOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Compress PDF',
	value: 'compress',
	action: 'Optimize · Compress PDF',
	description: 'Reduce a PDF file size using a preset compression level or custom profile',
	path: '/compressed-pdf',
});

export const compressDescription: INodeProperties[] = [
	createResourceIdField('compress'),
	{
		displayName: 'Compression Level',
		name: 'compressionLevel',
		type: 'options',
		options: [
			{ name: 'Low', value: 'low' },
			{ name: 'Medium', value: 'medium' },
			{ name: 'High', value: 'high' },
			{ name: 'Custom', value: 'custom' },
		],
		default: 'medium',
		required: true,
		displayOptions: {
			show: {
				operation: ['compress'],
			},
		},
		description: 'Choose the balance between output quality and file size reduction',
		routing: {
			send: {
				type: 'body',
				property: 'compression_level',
				preSend: [createCompressionProfilePreSend()],
			},
		},
	},
	...createCompressionProfileFields(),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				operation: ['compress'],
			},
		},
		options: [
			createIncludeFileInfoField('compress'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated compressed PDF without an extension',
			}),
			createResponseTypeField('compress'),
		],
	},
];
