import {
	NodeOperationError,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodePropertyOptions,
	type PreSendAction,
} from 'n8n-workflow';
import { createNonEmptyBodyStringField } from '../helpers/bodyFields';
import { createIncludeFileInfoField } from '../helpers/headers';
import { createResourceIdField, createResourceIdOperation } from '../helpers/resourceId';

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
	createResourceIdField('convertPostscript'),
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
				description: 'Whether to allow binary data in the PostScript file',
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
				description: 'The PostScript language level for the generated file',
				routing: { send: { type: 'body', property: 'ps_level' } },
			},
			{
				displayName: 'Print Annotations',
				name: 'printAnnotations',
				type: 'boolean',
				default: true,
				description: 'Whether to include printable PDF annotations',
				routing: { send: { type: 'body', property: 'print_annotations' } },
			},
			{
				displayName: 'Rotate Pages',
				name: 'rotate',
				type: 'boolean',
				default: false,
				description: 'Whether to allow page rotation in the PostScript file',
				routing: { send: { type: 'body', property: 'rotate' } },
			},
			{
				displayName: 'Scale',
				name: 'scale',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 1,
				description: 'The multiplier for page content size; must be greater than zero',
				routing: { send: { type: 'body', property: 'scale', preSend: [validateScale()] } },
			},
			{
				displayName: 'Shrink to Fit',
				name: 'shrinkToFit',
				type: 'boolean',
				default: false,
				description: 'Whether to shrink page content to fit the output page',
				routing: { send: { type: 'body', property: 'shrink_to_fit' } },
			},
		],
	},
];
