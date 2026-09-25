import type { INodeProperties } from 'n8n-workflow';
import {
	createDeferredMultipartUploadPreSend,
	createMultipartFormDataPreSend,
	createMultipartUploadPreSend,
} from './multipart';
import { createResourceIdField } from './resourceId';

type UrlRequestFormat = 'json' | 'multipart';
type InputSource = 'file' | 'resourceId' | 'url';

interface FileInputOptions {
	fieldName?: string;
	inputDataFieldName?: string;
	inputDataFieldDisplayName?: string;
	description?: string;
	deferUpload?: boolean;
	multipleValues?: boolean;
	multipleValueButtonText?: string;
}

interface UrlInputOptions {
	displayName?: string;
	multipleValues?: boolean;
	parameterName?: string;
	requestFormat?: UrlRequestFormat;
}

interface InputSourceOptions {
	file?: FileInputOptions;
	operation: string;
	sources?: ['file', ...InputSource[]];
	url?: UrlInputOptions;
}

interface SecondaryFileInputSourceOptions {
	allowNone?: boolean;
	displayName?: string;
	fileFieldName: string;
	fileInputDataFieldName: string;
	fileInputDataFieldDisplayName: string;
	inputTypeName: string;
	operation: string;
	resourceIdBodyProperty: string;
	resourceIdDescription: string;
	resourceIdDisplayName: string;
	resourceIdName: string;
	show?: Record<string, string[]>;
}

interface InputFileFieldsOptions {
	file?: FileInputOptions;
	inputTypeValue?: string;
	operation: string;
}

/**
 * Creates the data-field selector for one or more input files that share the
 * same multipart field name.
 */
export function createInputFileFields({
	file = {},
	inputTypeValue = 'inputFile',
	operation,
}: InputFileFieldsOptions): INodeProperties[] {
	const fileFieldName = file.fieldName ?? 'file';
	const inputDataFieldName = file.inputDataFieldName ?? 'inputFileDataFieldName';
	const inputDataFieldDisplayName =
		file.inputDataFieldDisplayName ?? 'Input File Data Field Name';
	const inputFileDescription =
		file.description ?? 'The name of the input field containing the file to process';
	const fileSupportsMultipleValues = file.multipleValues ?? false;
	const multipleValueButtonText =
		file.multipleValueButtonText ?? `Add ${inputDataFieldDisplayName}`;
	const displayOptions = {
		show: {
			operation: [operation],
			inputType: [inputTypeValue],
		},
	};

	const inputFileField = {
		displayName: inputDataFieldDisplayName,
		name: inputDataFieldName,
		type: 'string' as const,
		required: true,
		displayOptions,
		description: inputFileDescription,
		routing: {
			send: {
				type: 'body' as const,
				property: fileFieldName,
				preSend: [
					(file.deferUpload
						? createDeferredMultipartUploadPreSend
						: createMultipartUploadPreSend)({
						binaryDataPropertyNameParameter: inputDataFieldName,
						fileFieldName,
					}),
				],
			},
		},
	};

	return fileSupportsMultipleValues
		? [
				{
					...inputFileField,
					typeOptions: { multipleValues: true, multipleValueButtonText },
					default: ['data'],
				},
			]
		: [{ ...inputFileField, default: 'data' }];
}

/**
 * Creates the shared input controls for operations that can use an existing
 * pdfRest resource or upload binary files as multipart form data.
 */
export function createInputSourceFields({
	file = {},
	operation,
	sources = ['file', 'resourceId'],
	url = {},
}: InputSourceOptions): INodeProperties[] {
	if (sources.length === 0) {
		throw new Error('At least one input source is required.');
	}

	const urlParameterName = url.parameterName ?? 'url';
	const urlRequestFormat = url.requestFormat ?? 'json';
	const urlDisplayName = url.displayName ?? 'URL';
	const urlSupportsMultipleValues = url.multipleValues ?? false;
	const hasFileInput = sources.includes('file');
	const hasResourceIdInput = sources.includes('resourceId');
	const hasUrlInput = sources.includes('url');
	const sourceOptions: Record<InputSource, { name: string; value: string }> = {
		file: { name: 'Input File', value: 'inputFile' },
		resourceId: { name: 'Resource ID', value: 'resourceId' },
		url: { name: 'URL', value: 'url' },
	};
	const inputTypeOptions = sources.map((source) => sourceOptions[source]);
	const urlInputField = {
		displayName: urlDisplayName,
		name: urlParameterName,
		type: 'string' as const,
		required: true,
		placeholder: 'https://example.com/document.pdf',
		displayOptions: {
			show: {
				operation: [operation],
				inputType: ['url'],
			},
		},
		description: 'A publicly accessible URL for the file',
		routing: {
			send: {
				type: 'body' as const,
				property: urlParameterName,
				...(urlRequestFormat === 'multipart'
					? { preSend: [createMultipartFormDataPreSend()] }
					: {}),
			},
		},
	};
	const urlInputFields: INodeProperties[] = hasUrlInput
		? urlSupportsMultipleValues
			? [
					{
						...urlInputField,
						typeOptions: { multipleValues: true, multipleValueButtonText: 'Add URL' },
						default: [],
					},
				]
			: [
					{
						...urlInputField,
						default: '',
					},
				]
		: [];
	const fileInputFields = hasFileInput ? createInputFileFields({ file, operation }) : [];

	return [
		{
			displayName: 'Input Source',
			name: 'inputType',
			type: 'options',
			noDataExpression: true,
			options: inputTypeOptions,
			default: 'inputFile',
			displayOptions: {
				show: {
					operation: [operation],
				},
			},
		},
		...(hasResourceIdInput ? [createResourceIdField(operation, { inputType: 'resourceId' })] : []),
		...fileInputFields,
		...urlInputFields,
	];
}

/** Creates a file-or-resource-ID selector for an auxiliary request file. */
export function createSecondaryFileInputSourceFields({
	allowNone = false,
	displayName = 'Input Source',
	fileFieldName,
	fileInputDataFieldName,
	fileInputDataFieldDisplayName,
	inputTypeName,
	operation,
	resourceIdBodyProperty,
	resourceIdDescription,
	resourceIdDisplayName,
	resourceIdName,
	show = {},
}: SecondaryFileInputSourceOptions): INodeProperties[] {
	const baseShow = { operation: [operation], ...show };
	return [
		{
			displayName,
			name: inputTypeName,
			type: 'options',
			noDataExpression: true,
			options: [
				...(allowNone ? [{ name: 'None', value: 'none' }] : []),
				{ name: 'Input File', value: 'inputFile' },
				{ name: 'Resource ID', value: 'resourceId' },
			],
			default: 'inputFile',
			...(allowNone ? { default: 'none' } : {}),
			displayOptions: { show: baseShow },
		},
		{
			displayName: resourceIdDisplayName,
			name: resourceIdName,
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { ...baseShow, [inputTypeName]: ['resourceId'] } },
			description: resourceIdDescription,
			routing: { send: { type: 'body', property: resourceIdBodyProperty } },
		},
		...createInputFileFields({
			operation,
			inputTypeValue: 'inputFile',
			file: {
				fieldName: fileFieldName,
				inputDataFieldName: fileInputDataFieldName,
				inputDataFieldDisplayName: fileInputDataFieldDisplayName,
				deferUpload: true,
			},
		}).map((field) => ({
			...field,
			...(field.type === 'notice' ? { name: `${inputTypeName}Notice` } : {}),
			displayOptions: { show: { ...baseShow, [inputTypeName]: ['inputFile'] } },
		})),
	];
}
