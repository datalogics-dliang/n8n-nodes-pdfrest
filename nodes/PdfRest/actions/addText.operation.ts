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
import { createResourceIdField, createResourceIdOperation } from '../helpers/resourceId';

type JsonObject = Record<string, unknown>;

const textObjectsExample = JSON.stringify(
	[
		{
			font: 'Arial',
			max_width: '160',
			opacity: '1',
			page: '1',
			rotation: '0',
			text: 'Hello, PDF world!',
			text_color_rgb: '0,0,0',
			text_size: '12',
			x: '144',
			y: '144',
		},
		{
			font: 'Times New Roman',
			max_width: '175',
			opacity: '1',
			page: '2',
			rotation: '0',
			text: 'مرحبا بالعالم',
			text_color_rgb: '0,0,0',
			text_size: '72',
			x: '144',
			y: '720',
			is_rtl: 'true',
		},
		{
			font: 'Arial',
			max_width: '160',
			opacity: '0.35',
			page: '1',
			rotation: '0',
			text: 'SAMPLE DRAFT',
			text_color_rgb: '128,128,128',
			text_size: '14',
			x: '360',
			y: '36',
		},
	],
	null,
	2,
);

const textObjectProperties = [
	'font',
	'max_width',
	'opacity',
	'page',
	'rotation',
	'text',
	'text_color_rgb',
	'text_color_cmyk',
	'text_size',
	'x',
	'y',
	'is_rtl',
	'tag_actual_text',
	'tag_is_artifact',
	'tag_structure_type',
] as const;

const requiredTextObjectProperties = [
	'font',
	'max_width',
	'opacity',
	'page',
	'rotation',
	'text',
	'text_size',
	'x',
	'y',
] as const;

const contentStructureTypes = [
	'P',
	'H',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'Lbl',
	'Span',
	'Quote',
	'Note',
	'Reference',
	'BibEntry',
	'Code',
	'Link',
	'Annot',
	'Ruby',
	'RB',
	'RT',
	'RP',
	'Warichu',
	'WT',
	'WP',
	'Figure',
	'Formula',
	'Form',
] as const;

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

const languageTagPattern =
	/^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?(?:-(?:[a-z0-9]{5,8}|\d[a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?|x(?:-[a-z0-9]{1,8})+)$/i;

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: JsonObject, property: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, property);
}

function validateTextObject(value: unknown, index: number, tagEnabled: boolean): void {
	const path = `Text Objects item ${index + 1}`;
	if (!isObject(value)) {
		throw new Error(`${path} must be an object.`);
	}

	const unsupportedProperty = Object.keys(value).find(
		(property) => !textObjectProperties.includes(property as (typeof textObjectProperties)[number]),
	);
	if (unsupportedProperty) {
		throw new Error(`${path} contains unsupported property "${unsupportedProperty}".`);
	}

	for (const property of requiredTextObjectProperties) {
		if (!hasOwn(value, property) || typeof value[property] !== 'string') {
			throw new Error(`${path}.${property} is required and must be a string.`);
		}
	}

	for (const property of ['text_color_rgb', 'text_color_cmyk', 'is_rtl'] as const) {
		if (hasOwn(value, property) && typeof value[property] !== 'string') {
			throw new Error(`${path}.${property} must be a string.`);
		}
	}

	if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value.opacity as string)) {
		throw new Error(`${path}.opacity must be a string from 0 through 1.`);
	}
	if (!/^(?:[5-9]|[1-9]\d|100)$/.test(value.text_size as string)) {
		throw new Error(`${path}.text_size must be a string from 5 through 100.`);
	}

	const colorCount =
		Number(hasOwn(value, 'text_color_rgb')) + Number(hasOwn(value, 'text_color_cmyk'));
	if (colorCount !== 1) {
		throw new Error(`${path} must contain exactly one text color property.`);
	}

	if (hasOwn(value, 'tag_actual_text')) {
		if (typeof value.tag_actual_text !== 'string' || value.tag_actual_text.length < 1) {
			throw new Error(`${path}.tag_actual_text must contain at least one character.`);
		}
	}
	if (hasOwn(value, 'tag_is_artifact') && typeof value.tag_is_artifact !== 'boolean') {
		throw new Error(`${path}.tag_is_artifact must be a boolean.`);
	}
	if (
		hasOwn(value, 'tag_structure_type') &&
		(typeof value.tag_structure_type !== 'string' ||
			!contentStructureTypes.includes(value.tag_structure_type as never))
	) {
		throw new Error(`${path}.tag_structure_type must be a supported PDF structure type.`);
	}

	const hasTagProperty = ['tag_actual_text', 'tag_is_artifact', 'tag_structure_type'].some(
		(property) => hasOwn(value, property),
	);
	if (hasTagProperty && !tagEnabled) {
		throw new Error(`${path} tag properties require Tag Enabled to be true.`);
	}
}

function isBcp47LanguageTag(value: string): boolean {
	return grandfatheredLanguageTags.has(value.toLowerCase()) || languageTagPattern.test(value);
}

function createTextObjectsPreSend(): PreSendAction {
	return async function serializeTextObjects(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const body = requestOptions.body;
		const rawValue = isObject(body) ? body.text_objects : undefined;
		const tagEnabled = this.getNodeParameter('options.tagEnabled', false);
		if (typeof tagEnabled !== 'boolean') {
			throw new NodeOperationError(this.getNode(), 'Tag Enabled must be a boolean.');
		}

		try {
			const textObjects = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
			if (!Array.isArray(textObjects) || textObjects.length < 1) {
				throw new Error('Text Objects must be an array containing at least one item.');
			}
			textObjects.forEach((textObject, index) => validateTextObject(textObject, index, tagEnabled));
			requestOptions.body = {
				...(body as IDataObject),
				text_objects: JSON.stringify(textObjects),
			};
			return requestOptions;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Text Objects contains invalid JSON.';
			throw new NodeOperationError(this.getNode(), message);
		}
	};
}

function createTaggingPreSend(): PreSendAction {
	return async function prepareTagging(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const tagEnabled = this.getNodeParameter('options.tagEnabled', false);
		if (typeof tagEnabled !== 'boolean') {
			throw new NodeOperationError(this.getNode(), 'Tag Enabled must be a boolean.');
		}
		const body = requestOptions.body;
		if (!isObject(body)) {
			return requestOptions;
		}

		const nextBody = { ...body };
		if (!tagEnabled) {
			delete nextBody.tag_language;
			requestOptions.body = nextBody;
			return requestOptions;
		}

		if (
			nextBody.tag_language !== undefined &&
			(typeof nextBody.tag_language !== 'string' ||
				nextBody.tag_language.length < 1 ||
				!isBcp47LanguageTag(nextBody.tag_language))
		) {
			throw new NodeOperationError(
				this.getNode(),
				'Tag Language must be a valid BCP 47 language tag.',
			);
		}
		return requestOptions;
	};
}

export const addTextOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Add Text Blocks to PDF',
	value: 'addText',
	action: 'Modify · Add Text to PDF',
	description: 'Insert positioned text blocks into a PDF with custom fonts, styles, and tagging',
	path: '/pdf-with-added-text',
});

export const addTextDescription: INodeProperties[] = [
	createResourceIdField('addText'),
	{
		displayName: 'Text Objects',
		name: 'textObjects',
		type: 'json',
		default: textObjectsExample,
		required: true,
		displayOptions: {
			show: {
				operation: ['addText'],
			},
		},
		description: 'A JSON array of positioned text blocks to add to the PDF',
		routing: {
			send: {
				type: 'body',
				property: 'text_objects',
				preSend: [createTextObjectsPreSend()],
			},
		},
	},
	{
		displayName:
			'Text Objects documentation: <a href="https://docs.pdfrest.com/pdfrest-api-toolkit-cloud/api-reference-guide/tool/add-to-pdf/POST/pdf-with-added-text.body.text_objects/" target="_blank">Learn how to build the object</a>',
		name: 'textObjectsNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { operation: ['addText'] } },
	},
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				operation: ['addText'],
			},
		},
		options: [
			createIncludeFileInfoField('addText'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated PDF without an extension',
			}),
			createResponseTypeField('addText'),
			{
				displayName: 'Tag Enabled',
				name: 'tagEnabled',
				type: 'boolean',
				default: false,
				description: 'Whether to tag text added by this request for accessibility',
				routing: {
					send: {
						type: 'body',
						property: 'tag_enabled',
						preSend: [createTaggingPreSend()],
					},
				},
			},
			{
				displayName: 'Tag Language',
				name: 'tagLanguage',
				type: 'string',
				default: 'en-US',
				displayOptions: {
					show: {
						tagEnabled: [true],
					},
				},
				description: 'The BCP 47 language tag for newly added tagged text',
				routing: {
					send: {
						type: 'body',
						property: 'tag_language',
						preSend: [createTaggingPreSend()],
					},
				},
			},
		],
	},
];
