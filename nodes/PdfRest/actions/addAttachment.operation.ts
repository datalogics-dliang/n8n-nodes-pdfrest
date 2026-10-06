import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createIncludeFileInfoField, createResponseTypeField } from '../helpers/headers';
import { createSecondaryFileInputSourceFields } from '../helpers/inputSource';
import { createResourceIdField, createResourceIdOperation } from '../helpers/resourceId';

export const addAttachmentOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Add Attachment to PDF',
	value: 'addAttachment',
	action: 'Modify · Add Attachment to PDF',
	description: 'Attach an existing pdfRest resource file to a PDF document',
	path: '/pdf-with-added-attachment',
});

export const addAttachmentDescription: INodeProperties[] = [
	createResourceIdField('addAttachment'),
	...createSecondaryFileInputSourceFields({
		displayName: 'Attachment Input Source',
		description: 'Choose the file to attach from this workflow or one already stored by pdfRest',
		operation: 'addAttachment',
		inputTypeName: 'attachmentInputType',
		fileFieldName: 'file_to_attach',
		fileInputDataFieldName: 'attachmentFileDataFieldName',
		fileInputDataFieldDisplayName: 'Attachment Input File Data Field Name',
		resourceIdName: 'attachmentResourceId',
		resourceIdDisplayName: 'Attachment Resource ID',
		resourceIdBodyProperty: 'id_to_attach',
		resourceIdDescription: 'The ID of an existing pdfRest resource to attach to the PDF',
	}),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				operation: ['addAttachment'],
			},
		},
		options: [
			createIncludeFileInfoField('addAttachment'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated PDF without an extension',
			}),
			createResponseTypeField('addAttachment'),
		],
	},
];
