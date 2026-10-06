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
import { createInputSourceFields, createSecondaryFileInputSourceFields } from '../helpers/inputSource';
import { createResourceIdOperation } from '../helpers/resourceId';

type ProfileSource = 'custom' | 'preset';

const presetProfiles = [
	'lab-d50',
	'srgb',
	'apple-rgb',
	'color-match-rgb',
	'gamma-18',
	'gamma-22',
	'dot-gain-10',
	'dot-gain-15',
	'dot-gain-20',
	'dot-gain-25',
	'dot-gain-30',
	'monitor-rgb',
	'acrobat5-cmyk',
	'acrobat9-cmyk',
] as const;

const resourceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createProfileBranchPreSend(): PreSendAction {
	return async function prepareProfileBranch(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const profileSource = this.getNodeParameter('profileSource', 'preset') as ProfileSource;
		const body = requestOptions.body;
		const nextBody =
			body && typeof body === 'object' && !Array.isArray(body) ? { ...(body as IDataObject) } : {};

		if (profileSource === 'preset') {
			if (!presetProfiles.includes(nextBody.color_profile as never)) {
				throw new NodeOperationError(this.getNode(), 'Color Profile must be a supported preset.');
			}
			delete nextBody.profile_id;
		} else if (profileSource === 'custom') {
			if (nextBody.profile_id === undefined) {
				delete nextBody.profile_id;
			} else if (
				typeof nextBody.profile_id !== 'string' ||
				!resourceIdPattern.test(nextBody.profile_id)
			) {
				throw new NodeOperationError(
					this.getNode(),
					'Profile Resource ID must be a valid UUID for a custom profile.',
				);
			}
			nextBody.color_profile = 'custom';
		} else {
			throw new NodeOperationError(this.getNode(), 'Profile Source has an invalid value.');
		}

		requestOptions.body = nextBody;
		return requestOptions;
	};
}

export const convertColorsOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Convert PDF Colors',
	value: 'convertColors',
	action: 'Optimize · Convert PDF Colors',
	description: 'Convert PDF colors using a built-in preset or custom ICC color profile',
	path: '/pdf-with-converted-colors',
});

export const convertColorsDescription: INodeProperties[] = [
	...createInputSourceFields({
		operation: 'convertColors',
		description: 'Choose the PDF to recolor from this workflow or one already stored by pdfRest',
		resourceIdDescription: 'The resource ID of the PDF to recolor',
		file: {
			deferUpload: true,
			description: 'The input field containing the PDF to recolor',
		},
	}),
	{
		displayName: 'Profile Source',
		name: 'profileSource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Custom Profile', value: 'custom' },
			{ name: 'Preset', value: 'preset' },
		],
		default: 'preset',
		required: true,
		displayOptions: { show: { operation: ['convertColors'] } },
		description: 'Choose a built-in color profile or provide a custom ICC profile',
		routing: {
			send: {
				preSend: [createProfileBranchPreSend()],
			},
		},
	},
	{
		displayName: 'Color Profile',
		name: 'colorProfile',
		type: 'options',
		options: [
			{ name: 'Acrobat 5 CMYK', value: 'acrobat5-cmyk' },
			{ name: 'Acrobat 9 CMYK', value: 'acrobat9-cmyk' },
			{ name: 'Apple RGB', value: 'apple-rgb' },
			{ name: 'ColorMatch RGB', value: 'color-match-rgb' },
			{ name: 'Dot Gain 10%', value: 'dot-gain-10' },
			{ name: 'Dot Gain 15%', value: 'dot-gain-15' },
			{ name: 'Dot Gain 20%', value: 'dot-gain-20' },
			{ name: 'Dot Gain 25%', value: 'dot-gain-25' },
			{ name: 'Dot Gain 30%', value: 'dot-gain-30' },
			{ name: 'Gray Gamma 1.8', value: 'gamma-18' },
			{ name: 'Gray Gamma 2.2', value: 'gamma-22' },
			{ name: 'Lab D50', value: 'lab-d50' },
			{ name: 'Monitor RGB', value: 'monitor-rgb' },
			{ name: 'Select a Profile', value: '' },
			{ name: 'sRGB', value: 'srgb' },
		],
		default: '',
		required: true,
		displayOptions: {
			show: {
				operation: ['convertColors'],
				profileSource: ['preset'],
			},
		},
		description: 'The built-in color profile to apply to the PDF',
		routing: { send: { type: 'body', property: 'color_profile' } },
	},
	...createSecondaryFileInputSourceFields({
		displayName: 'Profile Input Source',
		description: 'Choose an ICC profile file from this workflow or one already stored by pdfRest',
		operation: 'convertColors',
		show: { profileSource: ['custom'] },
		inputTypeName: 'profileInputType',
		fileFieldName: 'profile',
		fileInputDataFieldName: 'profileFileDataFieldName',
		fileInputDataFieldDisplayName: 'Profile Input File Data Field Name',
		fileInputDescription: 'The input field containing the custom ICC color profile',
		resourceIdName: 'profileResourceId',
		resourceIdDisplayName: 'Profile Resource ID',
		resourceIdBodyProperty: 'profile_id',
		resourceIdDescription: 'The resource ID of an ICC color profile previously uploaded to pdfRest',
	}),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { operation: ['convertColors'] } },
		options: [
			createIncludeFileInfoField('convertColors'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated PDF without an extension',
			}),
			{
				displayName: 'Preserve Black',
				name: 'preserveBlack',
				type: 'options',
				options: [
					{ name: 'Do Not Preserve', value: 'false' },
					{ name: 'Preserve', value: 'true' },
				],
				default: 'false',
				description: 'Choose whether to preserve the original color definition of black elements',
				routing: { send: { type: 'body', property: 'preserve_black' } },
			},
			{
				displayName: 'Rendering Intent',
				name: 'renderingIntent',
				type: 'options',
				options: [
					{
						name: 'Absolute Colorimetric',
						value: 'absolute_colorimetric',
						description: 'Preserve the source white point for proofing or exact color matching',
					},
					{
						name: 'Perceptual',
						value: 'perceptual',
						description: 'Preserve visual relationships between colors, often for photographs',
					},
					{
						name: 'Profile Default',
						value: 'profile',
						description: 'Use the rendering intent specified by the selected ICC profile',
					},
					{
						name: 'Relative Colorimetric',
						value: 'relative_colorimetric',
						description: 'Keep reproducible colors and map others to the closest available color',
					},
					{
						name: 'Saturation',
						value: 'saturation',
						description: 'Prioritize vivid colors, often for charts and diagrams',
					},
				],
				default: 'profile',
				description: 'How colors are mapped into the selected ICC profile, especially colors outside its range',
				routing: { send: { type: 'body', property: 'rendering_intent' } },
			},
			createResponseTypeField('convertColors'),
		],
	},
];
