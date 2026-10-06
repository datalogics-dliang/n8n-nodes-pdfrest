import {
	NodeOperationError,
	type IDataObject,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodePropertyOptions,
	type PreSendAction,
} from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createHexColorToRgbPreSend } from '../helpers/color';
import { createIncludeFileInfoField, createResponseTypeField } from '../helpers/headers';
import { createSecondaryFileInputSourceFields } from '../helpers/inputSource';
import { createResourceIdField, createResourceIdOperation } from '../helpers/resourceId';

type WatermarkType = 'cmykText' | 'pdfResource' | 'rgbText';

function createWatermarkBranchPreSend(): PreSendAction {
	return async function prepareWatermarkBranch(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const watermarkType = this.getNodeParameter('watermarkType', 'rgbText') as WatermarkType;
		const body = requestOptions.body;
		const nextBody =
			body && typeof body === 'object' && !Array.isArray(body) ? { ...(body as IDataObject) } : {};
		const requireNonEmptyString = (property: string, displayName: string): void => {
			const value = nextBody[property];
			if (typeof value !== 'string' || value.length < 1) {
				throw new NodeOperationError(
					this.getNode(),
					`${displayName} is required for the selected watermark type.`,
				);
			}
		};
		const getCmykChannel = (
			name: string,
			displayName: string,
			defaultValue: number,
		): number => {
			const value = this.getNodeParameter(name, defaultValue);
			if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
				throw new NodeOperationError(
					this.getNode(),
					`${displayName} must be an integer from 0 through 100.`,
				);
			}
			return value;
		};

		if (watermarkType === 'rgbText') {
			requireNonEmptyString('watermark_text', 'Watermark Text');
			delete nextBody.text_color_cmyk;
			delete nextBody.watermark_file_id;
			delete nextBody.watermark_file_scale;
		} else if (watermarkType === 'cmykText') {
			requireNonEmptyString('watermark_text', 'Watermark Text');
			nextBody.text_color_cmyk = [
				getCmykChannel('cmykCyan', 'Watermark Text Cyan (C)', 0),
				getCmykChannel('cmykMagenta', 'Watermark Text Magenta (M)', 0),
				getCmykChannel('cmykYellow', 'Watermark Text Yellow (Y)', 0),
				getCmykChannel('cmykBlack', 'Watermark Text Black (K)', 100),
			].join(',');
			delete nextBody.text_color_rgb;
			delete nextBody.watermark_file_id;
			delete nextBody.watermark_file_scale;
		} else if (watermarkType === 'pdfResource') {
			if (nextBody.watermark_file_id !== undefined) {
				requireNonEmptyString('watermark_file_id', 'Watermark PDF Resource ID');
			} else {
				delete nextBody.watermark_file_id;
			}
			delete nextBody.watermark_text;
			delete nextBody.text_color_rgb;
			delete nextBody.text_color_cmyk;
			delete nextBody.font;
			delete nextBody.text_size;
		} else {
			throw new NodeOperationError(this.getNode(), 'Watermark Type has an invalid value.');
		}

		requestOptions.body = nextBody;
		return requestOptions;
	};
}

function createRequiredBranchStringField({
	displayName,
	name,
	bodyProperty,
	watermarkTypes,
	description,
}: {
	displayName: string;
	name: string;
	bodyProperty: string;
	watermarkTypes: WatermarkType[];
	description: string;
}): INodeProperties {
	return {
		displayName,
		name,
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				operation: ['watermark'],
				watermarkType: watermarkTypes,
			},
		},
		description,
		routing: {
			send: {
				type: 'body',
				property: bodyProperty,
			},
		},
	};
}

function createConditionalNonEmptyField({
	displayName,
	name,
	bodyProperty,
	watermarkTypes,
	defaultValue,
	description,
}: {
	displayName: string;
	name: string;
	bodyProperty: string;
	watermarkTypes: WatermarkType[];
	defaultValue: string;
	description: string;
}): INodeProperties {
	return {
		...createNonEmptyBodyStringField({ displayName, name, bodyProperty, description }),
		default: defaultValue,
		displayOptions: {
			show: {
				watermarkType: watermarkTypes,
			},
		},
	};
}

export const watermarkOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Add Watermark to PDF',
	value: 'watermark',
	action: 'Secure · Add Watermark to PDF',
	description: 'Add a customizable text or PDF watermark to selected pages of a PDF',
	path: '/watermarked-pdf',
});

export const watermarkDescription: INodeProperties[] = [
	createResourceIdField('watermark'),
	{
		displayName: 'Watermark Type',
		name: 'watermarkType',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Image (PDF File)', value: 'pdfResource' },
			{ name: 'Text (RGB)', value: 'rgbText' },
			{ name: 'Text (CMYK)', value: 'cmykText' },
		],
		default: 'rgbText',
		required: true,
		displayOptions: {
			show: {
				operation: ['watermark'],
			},
		},
		description: 'Choose whether to add text or a PDF as the watermark',
		routing: {
			send: {
				preSend: [createWatermarkBranchPreSend()],
			},
		},
	},
	createRequiredBranchStringField({
		displayName: 'Watermark Text',
		name: 'watermarkText',
		bodyProperty: 'watermark_text',
		watermarkTypes: ['cmykText', 'rgbText'],
		description: 'The text to add as a watermark',
	}),
	...[
		{
			displayName: 'Watermark Text Cyan (C)',
			name: 'cmykCyan',
			default: 0,
			channelName: 'cyan',
		},
		{
			displayName: 'Watermark Text Magenta (M)',
			name: 'cmykMagenta',
			default: 0,
			channelName: 'magenta',
		},
		{
			displayName: 'Watermark Text Yellow (Y)',
			name: 'cmykYellow',
			default: 0,
			channelName: 'yellow',
		},
		{
			displayName: 'Watermark Text Black (K)',
			name: 'cmykBlack',
			default: 100,
			channelName: 'black',
		},
	].map(({ displayName, name, default: defaultValue, channelName }): INodeProperties => ({
		displayName,
		name,
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 100, numberPrecision: 0 },
		default: defaultValue,
		required: true,
		displayOptions: {
			show: {
				operation: ['watermark'],
				watermarkType: ['cmykText'],
			},
		},
		description: `The ${channelName} percentage of the CMYK watermark text color`,
	})),
	{
		displayName: 'RGB Text Color',
		name: 'textColorRgb',
		type: 'color',
		default: '#000000',
		displayOptions: {
			show: {
				operation: ['watermark'],
				watermarkType: ['rgbText'],
			},
		},
		description: 'The color of the watermark text',
		routing: {
			send: {
				type: 'body',
				property: 'text_color_rgb',
				preSend: [createHexColorToRgbPreSend('text_color_rgb', 'RGB Text Color')],
			},
		},
	},
	...createSecondaryFileInputSourceFields({
		displayName: 'Watermark Input Source',
		description: 'Choose a PDF watermark from this workflow or one already stored by pdfRest',
		operation: 'watermark',
		show: { watermarkType: ['pdfResource'] },
		inputTypeName: 'watermarkInputType',
		fileFieldName: 'watermark_file',
		fileInputDataFieldName: 'watermarkFileDataFieldName',
		fileInputDataFieldDisplayName: 'Watermark PDF Input File Data Field Name',
		resourceIdName: 'watermarkFileId',
		resourceIdDisplayName: 'Watermark PDF Resource ID',
		resourceIdBodyProperty: 'watermark_file_id',
		resourceIdDescription: 'The resource ID of the PDF to use as the watermark',
	}),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				operation: ['watermark'],
			},
		},
		options: [
			{
				displayName: 'Behind Page',
				name: 'behindPage',
				type: 'options',
				options: [
					{ name: 'False', value: 'false' },
					{ name: 'True', value: 'true' },
				],
				default: 'false',
				description: 'Choose whether to place the watermark behind the page content',
				routing: { send: { type: 'body', property: 'behind_page' } },
			},
			createConditionalNonEmptyField({
				displayName: 'Font',
				name: 'font',
				bodyProperty: 'font',
				watermarkTypes: ['cmykText', 'rgbText'],
				defaultValue: 'Arial',
				description: 'The font to use for watermark text',
			}),
			{
				displayName: 'Horizontal Alignment',
				name: 'horizontalAlignment',
				type: 'options',
				options: [
					{ name: 'Center', value: 'center' },
					{ name: 'Left', value: 'left' },
					{ name: 'Right', value: 'right' },
				],
				default: 'center',
				description: 'The horizontal position used as the origin for the X offset',
				routing: { send: { type: 'body', property: 'horizontal_alignment' } },
			},
			createIncludeFileInfoField('watermark'),
			{
				displayName: 'Opacity',
				name: 'opacity',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1 },
				default: 0.5,
				description: 'The watermark opacity from zero through one',
				routing: { send: { type: 'body', property: 'opacity' } },
			},
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated watermarked PDF without an extension',
			}),
			createConditionalNonEmptyField({
				displayName: 'Pages',
				name: 'pages',
				bodyProperty: 'pages',
				watermarkTypes: ['cmykText', 'pdfResource', 'rgbText'],
				defaultValue: '1-last',
				description: 'The pages to watermark, using page numbers, ranges, and last',
			}),
			createResponseTypeField('watermark'),
			{
				displayName: 'Rotation',
				name: 'rotation',
				type: 'number',
				typeOptions: { numberPrecision: 0 },
				default: 0,
				description: 'The clockwise watermark rotation in degrees',
				routing: { send: { type: 'body', property: 'rotation' } },
			},
			{
				displayName: 'Text Size',
				name: 'textSize',
				type: 'number',
				typeOptions: { minValue: 5, maxValue: 100 },
				default: 72,
				displayOptions: { show: { watermarkType: ['cmykText', 'rgbText'] } },
				description: 'The watermark text size in points',
				routing: { send: { type: 'body', property: 'text_size' } },
			},
			{
				displayName: 'Vertical Alignment',
				name: 'verticalAlignment',
				type: 'options',
				options: [
					{ name: 'Bottom', value: 'bottom' },
					{ name: 'Center', value: 'center' },
					{ name: 'Top', value: 'top' },
				],
				default: 'center',
				description: 'The vertical position used as the origin for the Y offset',
				routing: { send: { type: 'body', property: 'vertical_alignment' } },
			},
			{
				displayName: 'Watermark Scale',
				name: 'watermarkFileScale',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0.5,
				displayOptions: { show: { watermarkType: ['pdfResource'] } },
				description: 'The scale factor applied to the watermark PDF',
				routing: { send: { type: 'body', property: 'watermark_file_scale' } },
			},
			{
				displayName: 'X Offset',
				name: 'x',
				type: 'number',
				typeOptions: { numberPrecision: 0 },
				default: 0,
				description: 'The horizontal offset from the selected alignment',
				routing: { send: { type: 'body', property: 'x' } },
			},
			{
				displayName: 'Y Offset',
				name: 'y',
				type: 'number',
				typeOptions: { numberPrecision: 0 },
				default: 0,
				description: 'The vertical offset from the selected alignment',
				routing: { send: { type: 'body', property: 'y' } },
			},
		],
	},
];
