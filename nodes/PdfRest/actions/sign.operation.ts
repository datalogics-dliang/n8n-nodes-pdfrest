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
import { createSecondaryFileInputSourceFields } from '../helpers/inputSource';
import { createDeferredMultipartUploadPreSend } from '../helpers/multipart';
import { createResourceIdField, createResourceIdOperation } from '../helpers/resourceId';

type JsonObject = Record<string, unknown>;

const signatureConfigurationExample = JSON.stringify(
	{
		type: 'new',
		name: 'esignature',
		logo_opacity: '0.5',
		location: {
			bottom_left: { x: '0', y: '0' },
			top_right: { x: '216', y: '72' },
			page: '1',
		},
		display: {
			include_distinguished_name: 'true',
			include_datetime: 'true',
			contact: 'My contact information',
			location: 'My signing location',
			name: 'John Doe',
			reason: 'My reason for signing',
		},
	},
	null,
	2,
);

function assertObject(value: unknown, path: string): asserts value is JsonObject {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${path} must be an object.`);
	}
}

function assertAllowedKeys(value: JsonObject, allowedKeys: string[], path: string): void {
	const unexpectedKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
	if (unexpectedKey) {
		throw new Error(`${path} contains unsupported property "${unexpectedKey}".`);
	}
}

function assertString(value: JsonObject, property: string, path: string, required = false): void {
	const propertyValue = value[property];
	if (propertyValue === undefined && !required) {
		return;
	}
	if (typeof propertyValue !== 'string') {
		throw new Error(`${path}.${property} must be a string.`);
	}
}

function validatePoint(value: unknown, path: string): void {
	assertObject(value, path);
	assertAllowedKeys(value, ['x', 'y'], path);
	assertString(value, 'x', path, true);
	assertString(value, 'y', path, true);
}

function validateSignatureConfiguration(value: unknown): asserts value is JsonObject {
	assertObject(value, 'Signature Configuration');
	assertAllowedKeys(
		value,
		['type', 'name', 'logo_opacity', 'location', 'display'],
		'Signature Configuration',
	);
	assertString(value, 'type', 'Signature Configuration', true);
	assertString(value, 'name', 'Signature Configuration', true);

	if (value.logo_opacity !== undefined) {
		if (
			typeof value.logo_opacity !== 'string' ||
			!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value.logo_opacity)
		) {
			throw new Error(
				'Signature Configuration.logo_opacity must be a string from 0.0 through 1.0.',
			);
		}
	}

	if (value.location !== undefined) {
		assertObject(value.location, 'Signature Configuration.location');
		assertAllowedKeys(
			value.location,
			['bottom_left', 'top_right', 'page'],
			'Signature Configuration.location',
		);
		validatePoint(value.location.bottom_left, 'Signature Configuration.location.bottom_left');
		validatePoint(value.location.top_right, 'Signature Configuration.location.top_right');
		assertString(value.location, 'page', 'Signature Configuration.location', true);
	}

	if (value.display !== undefined) {
		assertObject(value.display, 'Signature Configuration.display');
		assertAllowedKeys(
			value.display,
			['include_distinguished_name', 'include_datetime', 'contact', 'location', 'name', 'reason'],
			'Signature Configuration.display',
		);
		for (const property of ['include_distinguished_name', 'include_datetime']) {
			const propertyValue = value.display[property];
			if (propertyValue !== undefined && propertyValue !== 'true' && propertyValue !== 'false') {
				throw new Error(`Signature Configuration.display.${property} must be "true" or "false".`);
			}
		}
		for (const property of ['contact', 'location', 'name', 'reason']) {
			assertString(value.display, property, 'Signature Configuration.display');
		}
	}
}

function createSignatureConfigurationPreSend(): PreSendAction {
	return async function serializeSignatureConfiguration(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const body = requestOptions.body;
		const rawValue =
			body && typeof body === 'object' && !Array.isArray(body)
				? (body as IDataObject).signature_configuration
				: undefined;

		try {
			const configuration = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
			validateSignatureConfiguration(configuration);
			requestOptions.body = {
				...(body as IDataObject),
				signature_configuration: JSON.stringify(configuration),
			};
			return requestOptions;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'contains invalid JSON.';
			throw new NodeOperationError(this.getNode(), message);
		}
	};
}

function createCredentialBranchPreSend(): PreSendAction {
	return async function prepareCredentialBranch(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const credentialType = this.getNodeParameter('credentialType', 'pfx');
		const body = requestOptions.body;
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return requestOptions;
		}

		const nextBody = { ...(body as IDataObject) };
		const credentialFields =
			credentialType === 'pfx'
				? [
						['pfxCredentialInputType', 'pfx_credential_id'],
						['pfxPassphraseInputType', 'pfx_passphrase_id'],
					]
				: credentialType === 'certificate'
					? [
							['certificateInputType', 'certificate_id'],
							['privateKeyInputType', 'private_key_id'],
						]
					: [];

		if (credentialFields.length === 0) {
			throw new NodeOperationError(this.getNode(), 'Credential Type has an invalid value.');
		}

		for (const [, property] of credentialFields) {
			if (nextBody[property] === undefined) {
				delete nextBody[property];
				continue;
			}
			const value = nextBody[property];
			if (typeof value !== 'string' || value.length < 1) {
				throw new NodeOperationError(
					this.getNode(),
					`${property.replace(/_/g, ' ')} is required for the selected credential type.`,
				);
			}
		}

		for (const property of credentialType === 'pfx'
			? ['certificate_id', 'private_key_id']
			: ['pfx_credential_id', 'pfx_passphrase_id']) {
			delete nextBody[property];
		}
		requestOptions.body = nextBody;
		return requestOptions;
	};
}

function createLogoBranchPreSend(): PreSendAction {
	return async function prepareLogoBranch(
		this: IExecuteSingleFunctions,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const rawOptions = this.getNodeParameter('options', {});
		const body = requestOptions.body;
		if (
			typeof rawOptions !== 'object' ||
			rawOptions === null ||
			Array.isArray(rawOptions) ||
			!body ||
			typeof body !== 'object' ||
			Array.isArray(body)
		) {
			return requestOptions;
		}

		const options = rawOptions as IDataObject;
		const nextBody = { ...(body as IDataObject) };
		delete nextBody.logo_id;
		delete nextBody.logo_file;

		const hasLogoGroup = Object.prototype.hasOwnProperty.call(options, 'logo');
		const logo = options.logo as IDataObject | undefined;
		const source = logo?.source as IDataObject | undefined;
		const hasFile = typeof options.logoFileDataFieldName === 'string';
		const hasResourceId = typeof options.logoId === 'string';
		const inputType = hasLogoGroup
			? source?.inputType ?? 'inputFile'
			: options.logoInputType ?? (hasFile ? 'inputFile' : hasResourceId ? 'resourceId' : undefined);

		if (inputType === undefined) {
			requestOptions.body = nextBody;
			return requestOptions;
		}

		if (inputType === 'inputFile') {
			const binaryDataPropertyName = hasLogoGroup
				? this.getNodeParameter('options.logo.source.fileDataFieldName', 'data')
				: options.logoFileDataFieldName;
			if (typeof binaryDataPropertyName !== 'string' || binaryDataPropertyName.trim().length < 1) {
				throw new NodeOperationError(
					this.getNode(),
					'Logo Input File Data Field Name is required when the logo uses an input file.',
				);
			}
			nextBody.logo_file = binaryDataPropertyName.trim();
			requestOptions.body = nextBody;
			return hasLogoGroup
				? requestOptions
				: createDeferredMultipartUploadPreSend({
						binaryDataPropertyNameParameter: 'options.logoFileDataFieldName',
						fileFieldName: 'logo_file',
					}).call(this, requestOptions);
		}

		if (inputType === 'resourceId') {
			const resourceId = hasLogoGroup
				? this.getNodeParameter('options.logo.source.resourceId', '')
				: options.logoId;
			if (typeof resourceId !== 'string' || resourceId.trim().length < 1) {
				throw new NodeOperationError(
					this.getNode(),
					'Logo Resource ID is required when the logo uses a resource ID.',
				);
			}
			nextBody.logo_id = resourceId.trim();
			requestOptions.body = nextBody;
			return requestOptions;
		}

		throw new NodeOperationError(this.getNode(), 'Logo Input Source has an invalid value.');
	};
}

export const signOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Digitally Sign PDF',
	value: 'sign',
	action: 'Secure · Sign PDF (Digital Signature)',
	description:
		"Apply a configurable digital signature to verify a PDF's authenticity and integrity",
	path: '/signed-pdf',
});

export const signDescription: INodeProperties[] = [
	createResourceIdField('sign'),
	{
		displayName: 'Credential Type',
		name: 'credentialType',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Certificate', value: 'certificate' },
			{ name: 'PFX', value: 'pfx' },
		],
		default: 'pfx',
		required: true,
		displayOptions: {
			show: {
				operation: ['sign'],
			},
		},
		description: 'Choose the signing credential format to use',
		routing: {
			send: {
				preSend: [createCredentialBranchPreSend(), createLogoBranchPreSend()],
			},
		},
	},
	...createSecondaryFileInputSourceFields({
		displayName: 'PFX Credential Input Source',
		description: 'Choose a PFX signing credential from this workflow or one already stored by pdfRest',
		operation: 'sign',
		show: { credentialType: ['pfx'] },
		inputTypeName: 'pfxCredentialInputType',
		fileFieldName: 'pfx_credential_file',
		fileInputDataFieldName: 'pfxCredentialFileDataFieldName',
		fileInputDataFieldDisplayName: 'PFX Credential Input File Data Field Name',
		resourceIdName: 'pfxCredentialId',
		resourceIdDisplayName: 'PFX Credential Resource ID',
		resourceIdBodyProperty: 'pfx_credential_id',
		resourceIdDescription: 'The resource ID of a previously uploaded PFX credential file',
	}),
	...createSecondaryFileInputSourceFields({
		displayName: 'PFX Passphrase Input Source',
		description: 'Choose a PFX passphrase text file from this workflow or one already stored by pdfRest',
		operation: 'sign',
		show: { credentialType: ['pfx'] },
		inputTypeName: 'pfxPassphraseInputType',
		fileFieldName: 'pfx_passphrase_file',
		fileInputDataFieldName: 'pfxPassphraseFileDataFieldName',
		fileInputDataFieldDisplayName: 'PFX Passphrase Input File Data Field Name',
		resourceIdName: 'pfxPassphraseId',
		resourceIdDisplayName: 'PFX Passphrase Resource ID',
		resourceIdBodyProperty: 'pfx_passphrase_id',
		resourceIdDescription: 'The resource ID of a previously uploaded PFX passphrase text file',
	}),
	...createSecondaryFileInputSourceFields({
		displayName: 'Certificate Input Source',
		description: 'Choose a signing certificate from this workflow or one already stored by pdfRest',
		operation: 'sign',
		show: { credentialType: ['certificate'] },
		inputTypeName: 'certificateInputType',
		fileFieldName: 'certificate_file',
		fileInputDataFieldName: 'certificateFileDataFieldName',
		fileInputDataFieldDisplayName: 'Certificate Input File Data Field Name',
		resourceIdName: 'certificateId',
		resourceIdDisplayName: 'Certificate Resource ID',
		resourceIdBodyProperty: 'certificate_id',
		resourceIdDescription: 'The resource ID of a previously uploaded certificate file',
	}),
	...createSecondaryFileInputSourceFields({
		displayName: 'Private Key Input Source',
		description: 'Choose a signing private key from this workflow or one already stored by pdfRest',
		operation: 'sign',
		show: { credentialType: ['certificate'] },
		inputTypeName: 'privateKeyInputType',
		fileFieldName: 'private_key_file',
		fileInputDataFieldName: 'privateKeyFileDataFieldName',
		fileInputDataFieldDisplayName: 'Private Key Input File Data Field Name',
		resourceIdName: 'privateKeyId',
		resourceIdDisplayName: 'Private Key Resource ID',
		resourceIdBodyProperty: 'private_key_id',
		resourceIdDescription: 'The resource ID of a previously uploaded private-key file',
	}),
	{
		displayName: 'Signature Configuration',
		name: 'signatureConfiguration',
		type: 'json',
		default: signatureConfigurationExample,
		required: true,
		displayOptions: {
			show: {
				operation: ['sign'],
			},
		},
		description: 'The signature properties as a JSON object',
		routing: {
			send: {
				type: 'body',
				property: 'signature_configuration',
				preSend: [createSignatureConfigurationPreSend()],
			},
		},
	},
	{
		displayName:
			'Signature Configuration documentation: <a href="https://docs.pdfrest.com/pdfrest-api-toolkit-cloud/api-reference-guide/tool/sign-pdf/POST/signed-pdf.body.signature_configuration/" target="_blank">Learn how to build the object</a>',
		name: 'signatureConfigurationNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { operation: ['sign'] } },
	},
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				operation: ['sign'],
			},
		},
		options: [
			createIncludeFileInfoField('sign'),
			{
				displayName: 'Logo',
				name: 'logo',
				type: 'fixedCollection',
				typeOptions: { multipleValues: false },
				default: { source: { inputType: 'inputFile', fileDataFieldName: 'data' } },
				description: 'Choose an optional JPG, PNG, TIFF, or BMP signature logo',
				options: [
					{
						displayName: 'Logo',
						name: 'source',
						values: [
							{
								displayName:
									'Add a JPG, PNG, TIFF, or BMP image to appear with the digital signature',
								name: 'logoNotice',
								type: 'notice',
								default: '',
							},
							...createSecondaryFileInputSourceFields({
								operation: 'sign',
								nestedPath: 'options.logo.source',
								inputTypeName: 'inputType',
								fileFieldName: 'logo_file',
								fileInputDataFieldName: 'fileDataFieldName',
								fileInputDataFieldDisplayName: 'Logo Input File Data Field Name',
								fileInputDescription:
									'The name of the input field containing the signature logo file',
								resourceIdName: 'resourceId',
								resourceIdDisplayName: 'Logo Resource ID',
								resourceIdBodyProperty: 'logo_id',
								resourceIdDescription:
									'The resource ID of a JPG, PNG, TIFF, or BMP signature logo',
							}),
						],
					},
				],
			},
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated signed PDF without an extension',
			}),
			createResponseTypeField('sign'),
		],
	},
];
