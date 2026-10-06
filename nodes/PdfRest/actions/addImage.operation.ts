import {
	NodeOperationError,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodePropertyOptions,
	type PreSendAction,
} from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createIncludeFileInfoField, createResponseTypeField } from '../helpers/headers';
import { createInputSourceFields } from '../helpers/inputSource';
import { createDeferredMultipartUploadPreSend } from '../helpers/multipart';
import { createResourceIdOperation } from '../helpers/resourceId';

type JsonObject = Record<string, unknown>;
type ImageInputType = 'inputFile' | 'resourceId';

const languageTagPattern =
	/^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?(?:-(?:[a-z0-9]{5,8}|\d[a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?|x(?:-[a-z0-9]{1,8})+)$/i;
const grandfatheredLanguageTags = new Set([
	'art-lojban',
	'cel-gaulish',
	'en-gb-oed',
	'i-ami',
	'i-bnn',
	'i-default',
	'i-enochian',
	'i-hak',
	'i-klingon',
	'i-lux',
	'i-mingo',
	'i-navajo',
	'i-pwn',
	'i-tao',
	'i-tay',
	'i-tsu',
	'no-bok',
	'no-nyn',
	'sgn-be-fr',
	'sgn-be-nl',
	'sgn-ch-de',
	'zh-guoyu',
	'zh-hakka',
	'zh-min',
	'zh-min-nan',
	'zh-xiang',
]);

const structureTypeValues = [
	'Annot',
	'BibEntry',
	'Code',
	'Figure',
	'Form',
	'Formula',
	'H',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'Lbl',
	'Link',
	'Note',
	'P',
	'Quote',
	'Reference',
	'Ruby',
	'RB',
	'RP',
	'RT',
	'Span',
	'Warichu',
	'WP',
	'WT',
] as const;

const imageFileObjectsExample = JSON.stringify(
	[
		{
			image_index: 0,
			page: '1,3-last',
			x: 72,
			y: 144,
			width: 144,
		},
	],
	null,
	2,
);

const imageResourceObjectsExample = JSON.stringify(
	[
		{
			image_id: '<IMAGE_RESOURCE_ID>',
			page: '1,3-last',
			x: 72,
			y: 144,
			width: 144,
		},
	],
	null,
	2,
);

const imageObjectProperties = [
	'image_id',
	'image_index',
	'page',
	'x',
	'y',
	'width',
	'height',
	'tag_alt_text',
	'tag_is_artifact',
	'tag_structure_type',
] as const;

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseImageObjects(context: IExecuteSingleFunctions, rawValue: unknown): unknown {
	try {
		return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
	} catch {
		throw new NodeOperationError(context.getNode(), 'Image Objects must contain valid JSON.');
	}
}

function validateImageObject(
	context: IExecuteSingleFunctions,
	value: unknown,
	index: number,
	inputType: ImageInputType,
	imageFileCount: number,
	tagEnabled: boolean,
): void {
	const path = `Image Objects[${index}]`;
	if (!isObject(value)) {
		throw new NodeOperationError(context.getNode(), `${path} must be a JSON object.`);
	}

	const unsupportedProperty = Object.keys(value).find(
		(property) =>
			!imageObjectProperties.includes(property as (typeof imageObjectProperties)[number]),
	);
	if (unsupportedProperty) {
		throw new NodeOperationError(
			context.getNode(),
			`${path} contains unsupported property "${unsupportedProperty}".`,
		);
	}

	if (inputType === 'inputFile') {
		if (
			typeof value.image_index !== 'number' ||
			!Number.isInteger(value.image_index) ||
			value.image_index < 0 ||
			value.image_index >= imageFileCount
		) {
			throw new NodeOperationError(
				context.getNode(),
				`${path}.image_index must reference an uploaded image by its zero-based index.`,
			);
		}
		if (value.image_id !== undefined) {
			throw new NodeOperationError(
				context.getNode(),
				`${path} cannot include image_id when Image Input Source is Input File.`,
			);
		}
	} else {
		if (typeof value.image_id !== 'string' || value.image_id.trim().length < 1) {
			throw new NodeOperationError(
				context.getNode(),
				`${path}.image_id must contain an existing image resource ID.`,
			);
		}
		if (value.image_index !== undefined) {
			throw new NodeOperationError(
				context.getNode(),
				`${path} cannot include image_index when Image Input Source is Resource ID.`,
			);
		}
	}

	const page = value.page;
	if (
		!(typeof page === 'number' && Number.isInteger(page) && page >= 1) &&
		!(typeof page === 'string' && page.trim().length > 0)
	) {
		throw new NodeOperationError(
			context.getNode(),
			`${path}.page must be a page number or a non-empty page selector.`,
		);
	}

	for (const property of ['x', 'y'] as const) {
		const coordinate = value[property];
		if (typeof coordinate !== 'number' || !Number.isInteger(coordinate) || coordinate < 0) {
			throw new NodeOperationError(
				context.getNode(),
				`${path}.${property} must be a non-negative integer.`,
			);
		}
	}

	for (const property of ['width', 'height'] as const) {
		const dimension = value[property];
		if (
			dimension !== undefined &&
			(typeof dimension !== 'number' || !Number.isFinite(dimension) || dimension <= 0)
		) {
			throw new NodeOperationError(
				context.getNode(),
				`${path}.${property} must be a number greater than zero.`,
			);
		}
	}

	if (!tagEnabled) {
		delete value.tag_alt_text;
		delete value.tag_is_artifact;
		delete value.tag_structure_type;
		return;
	}

	if (
		value.tag_alt_text !== undefined &&
		(typeof value.tag_alt_text !== 'string' || value.tag_alt_text.length < 1)
	) {
		throw new NodeOperationError(
			context.getNode(),
			`${path}.tag_alt_text must contain at least one character.`,
		);
	}
	if (value.tag_is_artifact !== undefined && typeof value.tag_is_artifact !== 'boolean') {
		throw new NodeOperationError(context.getNode(), `${path}.tag_is_artifact must be a boolean.`);
	}
	if (
		value.tag_structure_type !== undefined &&
		!structureTypeValues.includes(value.tag_structure_type as (typeof structureTypeValues)[number])
	) {
		throw new NodeOperationError(
			context.getNode(),
			`${path}.tag_structure_type has an invalid value.`,
		);
	}
}

function createAddImagePreSend(): PreSendAction {
	return async function prepareAddImageRequest(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const body = requestOptions.body;
		const nextBody = isObject(body) ? { ...body } : {};
		const inputType = this.getNodeParameter('imageInputType', 'inputFile');
		if (inputType !== 'inputFile' && inputType !== 'resourceId') {
			throw new NodeOperationError(this.getNode(), 'Image Input Source has an invalid value.');
		}

		const rawImageObjects = parseImageObjects(this, nextBody.image_objects);
		const imageObjects = Array.isArray(rawImageObjects) ? rawImageObjects : [rawImageObjects];
		if (imageObjects.length < 1 || rawImageObjects === undefined || rawImageObjects === null) {
			throw new NodeOperationError(
				this.getNode(),
				'Image Objects must contain at least one image placement.',
			);
		}

		const rawImageFileNames = this.getNodeParameter('imageFileDataFieldNames', []);
		const imageFileNames = Array.isArray(rawImageFileNames)
			? rawImageFileNames
			: [rawImageFileNames];
		if (
			inputType === 'inputFile' &&
			(imageFileNames.length < 1 ||
				imageFileNames.some((name) => typeof name !== 'string' || name.trim().length < 1))
		) {
			throw new NodeOperationError(
				this.getNode(),
				'Image Input File Data Field Name must identify at least one image.',
			);
		}

		const tagEnabled = this.getNodeParameter('options.tagEnabled', false);
		if (typeof tagEnabled !== 'boolean') {
			throw new NodeOperationError(this.getNode(), 'Tag Enabled must be a boolean.');
		}
		for (const [index, imageObject] of imageObjects.entries()) {
			validateImageObject(this, imageObject, index, inputType, imageFileNames.length, tagEnabled);
		}

		if (tagEnabled) {
			nextBody.tag_enabled = true;
			if (
				nextBody.tag_language !== undefined &&
				(typeof nextBody.tag_language !== 'string' ||
					(!grandfatheredLanguageTags.has(nextBody.tag_language.toLowerCase()) &&
						!languageTagPattern.test(nextBody.tag_language)))
			) {
				throw new NodeOperationError(
					this.getNode(),
					'Tag Language must be a valid BCP 47 language tag.',
				);
			}
		} else {
			if (nextBody.tag_enabled !== undefined) nextBody.tag_enabled = false;
			delete nextBody.tag_language;
		}

		nextBody.image_objects = Array.isArray(rawImageObjects) ? imageObjects : imageObjects[0];
		if (inputType === 'inputFile') {
			await createDeferredMultipartUploadPreSend({
				binaryDataPropertyNameParameter: 'imageFileDataFieldNames',
				fileFieldName: 'image_files',
			}).call(this, requestOptions);
		} else {
			delete nextBody.image_files;
		}

		requestOptions.body = nextBody;
		return requestOptions;
	};
}

export const addImageOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Add Image to PDF',
	value: 'addImage',
	action: 'Modify · Add Image to PDF',
	description:
		'Insert one or more images into a PDF with custom placement, sizing, reuse, and accessibility tagging',
	path: '/pdf-with-added-image',
});

const imageFileDisplayOptions = {
	show: { operation: ['addImage'], imageInputType: ['inputFile'] },
};

export const addImageDescription: INodeProperties[] = [
	...createInputSourceFields({
		operation: 'addImage',
		file: { deferUpload: true },
	}),
	{
		displayName: 'Image Input Source',
		name: 'imageInputType',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Input File', value: 'inputFile' },
			{ name: 'Resource ID', value: 'resourceId' },
		],
		default: 'inputFile',
		displayOptions: { show: { operation: ['addImage'] } },
		description: 'Choose images from this workflow or images already stored by pdfRest',
	},
	{
		displayName: 'Image Input File Data Field Name',
		name: 'imageFileDataFieldNames',
		type: 'string',
		typeOptions: {
			multipleValues: true,
			multipleValueButtonText: 'Add Image Input File Data Field Name',
		},
		default: ['data'],
		required: true,
		displayOptions: imageFileDisplayOptions,
		description:
			'The ordered input fields containing images referenced by image indexes in Image Objects',
		routing: { send: { type: 'body', property: 'image_files' } },
	},
	{
		displayName:
			'Enter each existing image resource ID in the image_id field of its Image Object',
		name: 'imageResourceIdNotice',
		type: 'notice',
		default: '',
		displayOptions: {
			show: { operation: ['addImage'], imageInputType: ['resourceId'] },
		},
	},
	{
		displayName: 'Image Objects',
		name: 'imageObjects',
		type: 'json',
		default: imageFileObjectsExample,
		required: true,
		displayOptions: imageFileDisplayOptions,
		description:
			'One JSON placement object or an array of placements using image_index to reference an uploaded input file',
		routing: {
			send: {
				type: 'body',
				property: 'image_objects',
				preSend: [createAddImagePreSend()],
			},
		},
	},
	{
		displayName: 'Image Objects',
		name: 'resourceImageObjects',
		type: 'json',
		default: imageResourceObjectsExample,
		required: true,
		displayOptions: {
			show: { operation: ['addImage'], imageInputType: ['resourceId'] },
		},
		description:
			'One JSON placement object or an array of placements using image_id to reference an existing image resource',
		routing: {
			send: {
				type: 'body',
				property: 'image_objects',
				preSend: [createAddImagePreSend()],
			},
		},
	},
	{
		displayName:
			'Image Objects documentation: <a href="https://docs.pdfrest.com/pdfrest-api-toolkit-cloud/api-reference-guide/tool/add-to-pdf/POST/pdf-with-added-image/" target="_blank">Learn how to build the object</a>',
		name: 'imageObjectsNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { operation: ['addImage'] } },
	},
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { operation: ['addImage'] } },
		options: [
			createIncludeFileInfoField('addImage'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated PDF without an extension',
			}),
			createResponseTypeField('addImage'),
			{
				displayName: 'Tag Enabled',
				name: 'tagEnabled',
				type: 'boolean',
				default: false,
				description: 'Whether to enable accessibility tagging for the added images',
				routing: { send: { type: 'body', property: 'tag_enabled' } },
			},
			{
				displayName: 'Tag Language',
				name: 'tagLanguage',
				type: 'string',
				default: 'en-US',
				displayOptions: { show: { tagEnabled: [true] } },
				description: 'The BCP 47 language tag for the added image tag metadata',
				routing: { send: { type: 'body', property: 'tag_language' } },
			},
		],
	},
];
