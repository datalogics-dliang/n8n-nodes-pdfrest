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
import { appendBinaryData, createMultipartFormData } from '../helpers/multipart';

function createMergeInputsPreSend(): PreSendAction {
	return async function prepareMergeInputs(
		this: IExecuteSingleFunctions,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const rawInputs = this.getNodeParameter('mergeInputs.input', []);

		if (!Array.isArray(rawInputs) || rawInputs.length < 1) {
			throw new NodeOperationError(this.getNode(), 'At least one Merge Input is required.');
		}

		const inputs: Array<
			| { type: 'file'; inputFileDataFieldName: string; pages: string }
			| { type: 'id'; resourceId: string; pages: string }
		> = [];
		for (const [index, rawInput] of rawInputs.entries()) {
			if (typeof rawInput !== 'object' || rawInput === null || Array.isArray(rawInput)) {
				throw new NodeOperationError(this.getNode(), `Merge Input ${index + 1} must be an object.`);
			}

			const input = rawInput as IDataObject;
			if (typeof input.pages !== 'string' || input.pages.trim().length < 1) {
				throw new NodeOperationError(
					this.getNode(),
					`Pages for Merge Input ${index + 1} must contain at least one character.`,
				);
			}

			const inputType = input.inputType ?? 'resourceId';
			if (inputType === 'id' || inputType === 'resourceId') {
				if (typeof input.resourceId !== 'string' || input.resourceId.trim().length < 1) {
					throw new NodeOperationError(
						this.getNode(),
						`Resource ID for Merge Input ${index + 1} must contain at least one character.`,
					);
				}
				inputs.push({ type: 'id', resourceId: input.resourceId.trim(), pages: input.pages.trim() });
			} else if (inputType === 'inputFile') {
				if (
					typeof input.inputFileDataFieldName !== 'string' ||
					input.inputFileDataFieldName.trim().length < 1
				) {
					throw new NodeOperationError(
						this.getNode(),
						`Input File Data Field Name for Merge Input ${index + 1} must contain at least one character.`,
					);
				}
				inputs.push({
					type: 'file',
					inputFileDataFieldName: input.inputFileDataFieldName.trim(),
					pages: input.pages.trim(),
				});
			} else {
				throw new NodeOperationError(
					this.getNode(),
					`Input Source for Merge Input ${index + 1} has an invalid value.`,
				);
			}
		}

		const formData = createMultipartFormData(requestOptions, ['file', 'id[]', 'type[]', 'pages[]']);
		for (const input of inputs) {
			if (input.type === 'file') {
				await appendBinaryData(this, formData, input.inputFileDataFieldName, 'file');
			} else {
				formData.append('id[]', input.resourceId);
			}
			formData.append('type[]', input.type);
			formData.append('pages[]', input.pages);
		}
		requestOptions.body = formData as unknown as IHttpRequestOptions['body'];

		return requestOptions;
	};
}

export const mergeOperation: INodePropertyOptions = {
	name: 'Merge Multiple PDFs',
	value: 'merge',
	action: 'Modify · Merge PDFs',
	description: 'Combine multiple PDF resources and selected page ranges in a specified order',
	routing: {
		request: {
			method: 'POST',
			url: '/merged-pdf',
		},
	},
};

export const mergeDescription: INodeProperties[] = [
	{
		displayName: 'PDFs to Merge',
		name: 'mergeInputs',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		default: {
			input: [
				{
					resourceId: '',
					pages: '1-last',
					inputType: 'inputFile',
				},
				{
					resourceId: '',
					pages: '1-last',
					inputType: 'inputFile',
				},
			],
		},
		required: true,
		placeholder: 'Add PDF to Merge',
		displayOptions: {
			show: {
				operation: ['merge'],
			},
		},
		description: 'The ordered PDF resources and page expressions to merge',
		options: [
			{
				displayName: 'PDF',
				name: 'input',
				values: [
					{
						displayName: 'Input Source',
						name: 'inputType',
						type: 'options',
						options: [
							{ name: 'Input File', value: 'inputFile' },
							{ name: 'Resource ID', value: 'resourceId' },
						],
						default: 'inputFile',
					},
					{
						displayName: 'Resource ID',
						name: 'resourceId',
						type: 'string',
						default: '',
						required: true,
						displayOptions: { show: { inputType: ['resourceId', 'id'] } },
						description: 'The ID of an existing PDF resource to include in the merge',
					},
					{
						displayName: 'Input File Data Field Name',
						name: 'inputFileDataFieldName',
						type: 'string',
						default: 'data',
						required: true,
						displayOptions: { show: { inputType: ['inputFile'] } },
						description: 'The name of the input field containing the PDF to merge',
					},
					{
						displayName: 'Pages',
						name: 'pages',
						type: 'string',
						default: '1-last',
						required: true,
						placeholder: 'e.g. 1-3,5 or odd',
						description:
							'The pages to include from this PDF; use "all" or "1-last" for every page, or select pages with numbers, ranges, "even", or "odd"',
					},
				],
			},
		],
		routing: {
			send: {
				preSend: [createMergeInputsPreSend()],
			},
		},
	},
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				operation: ['merge'],
			},
		},
		options: [
			createIncludeFileInfoField('merge'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated merged PDF without an extension',
			}),
			createResponseTypeField('merge'),
		],
	},
];
