import {
	NodeOperationError,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodePropertyOptions,
	type PreSendAction,
} from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createIncludeFileInfoField } from '../helpers/headers';
import { createInputSourceFields } from '../helpers/inputSource';
import { createResourceIdOperation } from '../helpers/resourceId';

function validateScale(): PreSendAction {
	return async function validatePostscriptScale(
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const body = requestOptions.body;
		const scale =
			body && typeof body === 'object' && !Array.isArray(body) && !(body instanceof FormData)
				? (body as Record<string, unknown>).scale
				: undefined;
		if (scale !== undefined && (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0)) {
			throw new NodeOperationError(this.getNode(), 'Scale must be a number greater than zero.');
		}
		return requestOptions;
	};
}

export const convertPostscriptOperation: INodePropertyOptions = createResourceIdOperation({
	name: 'Convert PDF to PostScript',
	value: 'convertPostscript',
	action: 'Convert · PDF to PostScript',
	description: 'Convert a PDF to a PostScript file for print workflows',
	path: '/postscript',
});

export const convertPostscriptDescription: INodeProperties[] = [
	...createInputSourceFields({
		operation: 'convertPostscript',
		description: 'Choose a PDF from this workflow or a PDF already stored by pdfRest',
		resourceIdDescription: 'The resource ID of the PDF to convert to PostScript',
		file: {
			deferUpload: true,
			description: 'The input field containing the PDF to convert to PostScript',
		},
	}),
	{
		displayName: 'Optional Fields',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { operation: ['convertPostscript'] } },
		options: [
			{
				displayName: 'Binary Output',
				name: 'binaryOutput',
				type: 'boolean',
				default: true,
				description: 'Whether to use binary output instead of text-safe, 7-bit PostScript',
				routing: { send: { type: 'body', property: 'binary_output' } },
			},
			createIncludeFileInfoField('convertPostscript'),
			createNonEmptyBodyStringField({
				displayName: 'Output File Name',
				name: 'output',
				bodyProperty: 'output',
				description: 'The name of the generated PostScript file without an extension',
			}),
			{
				displayName: 'Page Range',
				name: 'pageRange',
				type: 'string',
				default: 'all',
				placeholder: 'e.g. 1,3-5,14-last',
				description: 'The pages to convert, using page numbers, ranges, or all',
				routing: { send: { type: 'body', property: 'page_range' } },
			},
			{
				displayName: 'PostScript Level',
				name: 'postscriptLevel',
				type: 'options',
				options: [
					{ name: 'Level 2', value: 2 },
					{ name: 'Level 3', value: 3 },
				],
				default: 3,
				description: 'The PostScript language level required by the receiving printer or system',
				routing: { send: { type: 'body', property: 'ps_level' } },
			},
			{
				displayName: 'Print Annotations',
				name: 'printAnnotations',
				type: 'boolean',
				default: true,
				description: 'Whether to include printable comments, markups, and other annotations',
				routing: { send: { type: 'body', property: 'print_annotations' } },
			},
			{
				displayName: 'Rotate Pages',
				name: 'rotate',
				type: 'boolean',
				default: false,
				description: 'Whether to rotate pages in the generated PostScript output',
				routing: { send: { type: 'body', property: 'rotate' } },
			},
			{
				displayName: 'Scale',
				name: 'scale',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 1,
				description:
				'The page content size multiplier: 1 keeps the original size, below 1 shrinks it, and above 1 enlarges it',
				routing: { send: { type: 'body', property: 'scale', preSend: [validateScale()] } },
			},
			{
				displayName: 'Shrink to Fit',
				name: 'shrinkToFit',
				type: 'boolean',
				default: false,
				description: 'Whether to shrink oversized content to fit within the output page',
				routing: { send: { type: 'body', property: 'shrink_to_fit' } },
			},
		],
	},
];
