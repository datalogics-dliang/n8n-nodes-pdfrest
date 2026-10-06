import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createIncludeFileInfoField, createResponseTypeField } from '../helpers/headers';
import { createSecondaryFileInputSourceFields } from '../helpers/inputSource';
import { createResourceIdField, createResourceIdOperation } from '../helpers/resourceId';

export const importFormDataOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Import Form Data into PDF',
	value: 'importFormData',
	action: 'Forms · Import Form Data',
	description: 'Import external form data into matching editable AcroForm or XFA fields in a PDF',
	path: '/pdf-with-imported-form-data',
});

export const importFormDataDescription: INodeProperties[] = [
	createResourceIdField('importFormData'),
	...createSecondaryFileInputSourceFields({
		displayName: 'Form Data Input Source',
		description: 'Choose an FDF, XFDF, XML, XDP, or XFD form data file from this workflow or one already stored by pdfRest',
		operation: 'importFormData',
		inputTypeName: 'formDataInputType',
		fileFieldName: 'data_file',
		fileInputDataFieldName: 'formDataFileDataFieldName',
		fileInputDataFieldDisplayName: 'Form Data Input File Data Field Name',
		resourceIdName: 'dataFileResourceId',
		resourceIdDisplayName: 'Form Data Resource ID',
		resourceIdBodyProperty: 'data_file_id',
		resourceIdDescription:
			'The ID of an existing FDF, XFDF, XML, XDP, or XFD form-data resource in pdfRest',
	}),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				operation: ['importFormData'],
			},
		},
		options: [
			createIncludeFileInfoField('importFormData'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated PDF without an extension',
			}),
			createResponseTypeField('importFormData'),
		],
	},
];
