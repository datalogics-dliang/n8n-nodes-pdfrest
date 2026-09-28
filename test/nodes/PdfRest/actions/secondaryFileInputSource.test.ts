import type { INodeProperties } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { addAttachmentDescription } from '../../../../nodes/PdfRest/actions/addAttachment.operation';
import { compressDescription } from '../../../../nodes/PdfRest/actions/compress.operation';
import { convertColorsDescription } from '../../../../nodes/PdfRest/actions/convertColors.operation';
import { importFormDataDescription } from '../../../../nodes/PdfRest/actions/importFormData.operation';
import { signDescription } from '../../../../nodes/PdfRest/actions/sign.operation';
import { watermarkDescription } from '../../../../nodes/PdfRest/actions/watermark.operation';

const secondaryFileDescriptions = [
	{
		name: 'addAttachment',
		description: addAttachmentDescription,
		inputTypeName: 'attachmentInputType',
		fileInputDataFieldName: 'attachmentFileDataFieldName',
		fileInputDataFieldDisplayName: 'Attachment Input File Data Field Name',
		resourceIdName: 'attachmentResourceId',
		resourceIdDisplayName: 'Attachment Resource ID',
		resourceIdBodyProperty: 'id_to_attach',
	},
	{
		name: 'compress',
		description: compressDescription,
		inputTypeName: 'profileInputType',
		fileInputDataFieldName: 'profileFileDataFieldName',
		fileInputDataFieldDisplayName: 'Profile Input File Data Field Name',
		resourceIdName: 'profileId',
		resourceIdDisplayName: 'Profile Resource ID',
		resourceIdBodyProperty: 'profile_id',
	},
	{
		name: 'convertColors',
		description: convertColorsDescription,
		inputTypeName: 'profileInputType',
		fileInputDataFieldName: 'profileFileDataFieldName',
		fileInputDataFieldDisplayName: 'Profile Input File Data Field Name',
		resourceIdName: 'profileResourceId',
		resourceIdDisplayName: 'Profile Resource ID',
		resourceIdBodyProperty: 'profile_id',
	},
	{
		name: 'importFormData',
		description: importFormDataDescription,
		inputTypeName: 'formDataInputType',
		fileInputDataFieldName: 'formDataFileDataFieldName',
		fileInputDataFieldDisplayName: 'Form Data Input File Data Field Name',
		resourceIdName: 'dataFileResourceId',
		resourceIdDisplayName: 'Form Data Resource ID',
		resourceIdBodyProperty: 'data_file_id',
	},
	{
		name: 'sign PFX credential',
		description: signDescription,
		inputTypeName: 'pfxCredentialInputType',
		fileInputDataFieldName: 'pfxCredentialFileDataFieldName',
		fileInputDataFieldDisplayName: 'PFX Credential Input File Data Field Name',
		resourceIdName: 'pfxCredentialId',
		resourceIdDisplayName: 'PFX Credential Resource ID',
		resourceIdBodyProperty: 'pfx_credential_id',
	},
	{
		name: 'sign PFX passphrase',
		description: signDescription,
		inputTypeName: 'pfxPassphraseInputType',
		fileInputDataFieldName: 'pfxPassphraseFileDataFieldName',
		fileInputDataFieldDisplayName: 'PFX Passphrase Input File Data Field Name',
		resourceIdName: 'pfxPassphraseId',
		resourceIdDisplayName: 'PFX Passphrase Resource ID',
		resourceIdBodyProperty: 'pfx_passphrase_id',
	},
	{
		name: 'sign certificate',
		description: signDescription,
		inputTypeName: 'certificateInputType',
		fileInputDataFieldName: 'certificateFileDataFieldName',
		fileInputDataFieldDisplayName: 'Certificate Input File Data Field Name',
		resourceIdName: 'certificateId',
		resourceIdDisplayName: 'Certificate Resource ID',
		resourceIdBodyProperty: 'certificate_id',
	},
	{
		name: 'sign private key',
		description: signDescription,
		inputTypeName: 'privateKeyInputType',
		fileInputDataFieldName: 'privateKeyFileDataFieldName',
		fileInputDataFieldDisplayName: 'Private Key Input File Data Field Name',
		resourceIdName: 'privateKeyId',
		resourceIdDisplayName: 'Private Key Resource ID',
		resourceIdBodyProperty: 'private_key_id',
	},
	{
		name: 'watermark',
		description: watermarkDescription,
		inputTypeName: 'watermarkInputType',
		fileInputDataFieldName: 'watermarkFileDataFieldName',
		fileInputDataFieldDisplayName: 'Watermark PDF Input File Data Field Name',
		resourceIdName: 'watermarkFileId',
		resourceIdDisplayName: 'Watermark PDF Resource ID',
		resourceIdBodyProperty: 'watermark_file_id',
	},
] as const;

function findField(description: INodeProperties[], name: string) {
	return (
		description.find((field) => field.name === name) ??
		description.flatMap((field) => field.options ?? []).find((field) => field.name === name)
	);
}

describe('secondary file input sources', () => {
	for (const {
		name,
		description,
		inputTypeName,
		fileInputDataFieldName,
		fileInputDataFieldDisplayName,
		resourceIdName,
		resourceIdDisplayName,
		resourceIdBodyProperty,
	} of secondaryFileDescriptions) {
		it(`uses role-specific file and Resource ID fields for ${name}`, () => {
			const inputType = findField(description, inputTypeName);
			const fileInputDataField = findField(description, fileInputDataFieldName);
			const resourceIdField = findField(description, resourceIdName);

			expect(inputType).toMatchObject({
				type: 'options',
				default: 'inputFile',
				options: [
					{ name: 'Input File', value: 'inputFile' },
					{ name: 'Resource ID', value: 'resourceId' },
				],
			});
			expect(resourceIdField).toMatchObject({
				displayName: resourceIdDisplayName,
				type: 'string',
				default: '',
				displayOptions: { show: { [inputTypeName]: ['resourceId'] } },
				routing: { send: { type: 'body', property: resourceIdBodyProperty } },
			});
			expect(fileInputDataField).toMatchObject({
				displayName: fileInputDataFieldDisplayName,
				type: 'string',
				default: 'data',
				displayOptions: { show: { [inputTypeName]: ['inputFile'] } },
			});
		});
	}
});
