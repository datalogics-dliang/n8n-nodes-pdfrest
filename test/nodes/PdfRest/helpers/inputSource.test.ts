import { describe, expect, it } from 'vitest';
import {
	createInputSourceFields,
	createSecondaryFileInputSourceFields,
} from '../../../../nodes/PdfRest/helpers/inputSource';

describe('createInputSourceFields', () => {
	it('creates input controls in display order with conditional visibility', () => {
		const fields = createInputSourceFields({
			operation: 'split',
			file: {
				fieldName: 'file',
				inputDataFieldName: 'inputFileDataFieldName',
				description: 'The name of the input field containing the PDF to split',
			},
		});

		expect(fields.map((field) => field.name)).toEqual([
			'inputType',
			'resourceId',
			'inputFileDataFieldName',
		]);
		expect(fields[0].default).toBe('inputFile');
		expect(fields[1].displayOptions?.show).toEqual({
			operation: ['split'],
			inputType: ['resourceId'],
		});
		expect(fields[2].displayOptions?.show).toEqual({
			operation: ['split'],
			inputType: ['inputFile'],
		});
	});

	it('creates any configured combination of input sources', () => {
		const fields = createInputSourceFields({
			operation: 'upload',
			sources: ['file', 'url'],
			url: { requestFormat: 'multipart' },
		});

		const inputType = fields[0];
		const url = fields[2];
		expect(inputType.options).toContainEqual({ name: 'URL', value: 'url' });
		expect(inputType.options).not.toContainEqual({ name: 'Resource ID', value: 'resourceId' });
		expect(url).toMatchObject({
			name: 'url',
			displayOptions: { show: { operation: ['upload'], inputType: ['url'] } },
		});
		expect(url.routing?.send?.preSend).toHaveLength(1);
	});

	it('does not create a generic input file notice', () => {
		const fields = createInputSourceFields({
			operation: 'upload',
			sources: ['file'],
		});

		expect(fields.map((field) => field.name)).not.toContain('inputFileNotice');
	});

	it('creates a repeatable file data field selector when enabled', () => {
		const fields = createInputSourceFields({
			operation: 'upload',
			sources: ['file'],
			file: { multipleValues: true },
		});
		const fileField = fields.find(({ name }) => name === 'inputFileDataFieldName');

		expect(fileField).toMatchObject({
			displayName: 'Input File Data Field Name',
			typeOptions: {
				multipleValues: true,
				multipleValueButtonText: 'Add Input File Data Field Name',
			},
			default: ['data'],
		});
	});

	it('defaults a secondary file source to input data and preserves its resource-ID alternative', () => {
		const fields = createSecondaryFileInputSourceFields({
			displayName: 'Image Input Source',
			operation: 'addImage',
			inputTypeName: 'imageInputType',
			fileFieldName: 'image_file',
			fileInputDataFieldName: 'imageFileDataFieldName',
			fileInputDataFieldDisplayName: 'Image Input File Data Field Name',
			resourceIdName: 'imageResourceId',
			resourceIdDisplayName: 'Image Resource ID',
			resourceIdBodyProperty: 'image_id',
			resourceIdDescription: 'An existing image resource',
		});

		expect(fields[0]).toMatchObject({ name: 'imageInputType', default: 'inputFile' });
		expect(fields[1]).toMatchObject({
			name: 'imageResourceId',
			displayOptions: { show: { operation: ['addImage'], imageInputType: ['resourceId'] } },
			routing: { send: { property: 'image_id' } },
		});
		expect(fields[2]).toMatchObject({
			name: 'imageFileDataFieldName',
			displayName: 'Image Input File Data Field Name',
			default: 'data',
			displayOptions: { show: { operation: ['addImage'], imageInputType: ['inputFile'] } },
			routing: { send: { property: 'image_file' } },
		});
	});

	it('routes grouped secondary fields using their nested source selector', () => {
		const fields = createSecondaryFileInputSourceFields({
			operation: 'sign',
			inputTypeName: 'inputType',
			nestedPath: 'options.logo.source',
			fileFieldName: 'logo_file',
			fileInputDataFieldName: 'fileDataFieldName',
			fileInputDataFieldDisplayName: 'Logo Input File Data Field Name',
			resourceIdName: 'resourceId',
			resourceIdDisplayName: 'Logo Resource ID',
			resourceIdBodyProperty: 'logo_id',
			resourceIdDescription: 'An existing logo resource',
		});

		expect(fields[1].displayOptions?.show).toEqual({
			'options.logo.source.inputType': ['resourceId'],
		});
		expect(fields[2].displayOptions?.show).toEqual({
			'options.logo.source.inputType': ['inputFile'],
		});
	});
});
