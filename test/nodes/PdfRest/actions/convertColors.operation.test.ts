import type { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import {
	convertColorsDescription,
	convertColorsOperation,
} from '../../../../nodes/PdfRest/actions/convertColors.operation';

const profileId = '11111111-1111-4111-8111-111111111111';

function getField(name: string) {
	return convertColorsDescription.find((field) => field.name === name);
}

function getOptionalField(name: string) {
	return getField('options')?.options?.find((field) => field.name === name);
}

function context(profileSource: unknown): IExecuteSingleFunctions {
	return {
		getNode: () => ({
			name: 'Convert PDF Colors',
			type: '@pdfrest/n8n-nodes-pdfrest.pdfRest',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getNodeParameter: (name: string, fallback: unknown) => {
			expect(name).toBe('profileSource');
			expect(fallback).toBe('preset');
			return profileSource;
		},
	} as unknown as IExecuteSingleFunctions;
}

describe('Convert PDF Colors operation', () => {
	it('uses the OpenAPI operation identity and JSON route', () => {
		expect(convertColorsOperation).toMatchObject({
			name: 'Convert PDF Colors',
			value: 'convertColors',
			action: 'Optimize · Convert PDF Colors',
			routing: {
				request: {
					method: 'POST',
					url: '/pdf-with-converted-colors',
					headers: { 'Content-Type': 'application/json' },
				},
			},
		});
	});

	it('requires the public PDF resource ID and a routing-free profile source', () => {
		expect(getField('resourceId')).toMatchObject({
			displayName: 'Resource ID',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { operation: ['convertColors'] } },
			routing: { send: { type: 'body', property: 'id' } },
		});
		const source = getField('profileSource');
		expect(source).toMatchObject({
			displayName: 'Profile Source',
			type: 'options',
			noDataExpression: true,
			options: [
				{ name: 'Custom Profile', value: 'custom' },
				{ name: 'Preset', value: 'preset' },
			],
			default: 'preset',
			required: true,
			displayOptions: { show: { operation: ['convertColors'] } },
			routing: { send: {} },
		});
		expect(source?.routing?.send?.type).toBeUndefined();
		expect(source?.routing?.send?.property).toBeUndefined();
		expect(source?.routing?.send?.preSend).toHaveLength(1);
	});

	it('maps every preset profile with progressive disclosure', () => {
		const profile = getField('colorProfile');
		expect(profile).toMatchObject({
			displayName: 'Color Profile',
			type: 'options',
			default: '',
			required: true,
			displayOptions: {
				show: { operation: ['convertColors'], profileSource: ['preset'] },
			},
			routing: { send: { type: 'body', property: 'color_profile' } },
		});
		expect(profile?.options?.map(({ value }) => value)).toEqual([
			'acrobat5-cmyk',
			'acrobat9-cmyk',
			'apple-rgb',
			'color-match-rgb',
			'dot-gain-10',
			'dot-gain-15',
			'dot-gain-20',
			'dot-gain-25',
			'dot-gain-30',
			'gamma-18',
			'gamma-22',
			'lab-d50',
			'monitor-rgb',
			'',
			'srgb',
		]);
	});

	it('maps only the profile resource ID for the custom JSON branch', () => {
		expect(getField('profileResourceId')).toMatchObject({
			displayName: 'Profile Resource ID',
			type: 'string',
			default: '',
			required: true,
			displayOptions: {
				show: { operation: ['convertColors'], profileSource: ['custom'] },
			},
			routing: { send: { type: 'body', property: 'profile_id' } },
		});
	});

	it('keeps each preset branch and removes an inactive custom profile ID', async () => {
		const preSend = getField('profileSource')?.routing?.send?.preSend?.[0];
		const presets =
			getField('colorProfile')
				?.options?.map(({ value }) => value)
				.filter((value) => value !== '') ?? [];
		for (const color_profile of presets) {
			const request: IHttpRequestOptions = {
				url: '/pdf-with-converted-colors',
				body: { id: 'pdf-id', color_profile, profile_id: profileId, preserve_black: 'false' },
			};
			await expect(preSend?.call(context('preset'), request)).resolves.toBe(request);
			expect(request.body).toEqual({
				id: 'pdf-id',
				color_profile,
				preserve_black: 'false',
			});
		}
	});

	it('creates the custom resource-ID profile branch', async () => {
		const request: IHttpRequestOptions = {
			url: '/pdf-with-converted-colors',
			body: {
				id: 'pdf-id',
				color_profile: 'stale-preset',
				profile_id: profileId,
				output: 'converted',
			},
		};
		await getField('profileSource')?.routing?.send?.preSend?.[0]?.call(context('custom'), request);
		expect(request.body).toEqual({
			id: 'pdf-id',
			color_profile: 'custom',
			profile_id: profileId,
			output: 'converted',
		});
	});

	it('validates the active profile branch and rejects unknown source values', async () => {
		const preSend = getField('profileSource')?.routing?.send?.preSend?.[0];
		for (const color_profile of ['custom', 'unknown', '', undefined]) {
			await expect(
				preSend?.call(context('preset'), {
					url: '/pdf-with-converted-colors',
					body: { color_profile },
				}),
			).rejects.toThrow('Color Profile must be a supported preset');
		}
		for (const profile_id of ['', 'not-a-uuid', 123]) {
			await expect(
				preSend?.call(context('custom'), {
					url: '/pdf-with-converted-colors',
					body: { profile_id },
				}),
			).rejects.toThrow('Profile Resource ID must be a valid UUID');
		}
		await expect(
			preSend?.call(context('unknown'), {
				url: '/pdf-with-converted-colors',
				body: {},
			}),
		).rejects.toThrow('Profile Source has an invalid value');
	});

	it('declares every optional field alphabetically with exact defaults and routing', () => {
		expect(getField('options')).toMatchObject({
			displayName: 'Optional Fields',
			type: 'collection',
			default: {},
			displayOptions: { show: { operation: ['convertColors'] } },
		});
		expect(getField('options')?.options?.map(({ name }) => name)).toEqual([
			'includeFileInfo',
			'output',
			'preserveBlack',
			'renderingIntent',
			'responseType',
		]);
		expect(getOptionalField('output')).toMatchObject({
			displayName: 'Output File Name',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'output' } },
		});
		expect(getOptionalField('preserveBlack')).toMatchObject({
			displayName: 'Preserve Black',
			type: 'options',
			options: [
				{ name: 'Do Not Preserve', value: 'false' },
				{ name: 'Preserve', value: 'true' },
			],
			default: 'false',
			routing: { send: { type: 'body', property: 'preserve_black' } },
		});
		expect(getOptionalField('renderingIntent')).toMatchObject({
			displayName: 'Rendering Intent',
			type: 'options',
			options: [
				{ name: 'Absolute Colorimetric', value: 'absolute_colorimetric' },
				{ name: 'Perceptual', value: 'perceptual' },
				{ name: 'Profile Default', value: 'profile' },
				{ name: 'Relative Colorimetric', value: 'relative_colorimetric' },
				{ name: 'Saturation', value: 'saturation' },
			],
			default: 'profile',
			routing: { send: { type: 'body', property: 'rendering_intent' } },
		});
	});

	it('enforces output minimum length and routes inherited headers', async () => {
		const output = getOptionalField('output');
		await expect(
			output?.routing?.send?.preSend?.[0]?.call(context('preset'), {
				url: '/pdf-with-converted-colors',
				body: { output: '' },
			}),
		).rejects.toThrow('Output File Name must contain at least one character');

		const includeRequest: IHttpRequestOptions = { url: '/pdf-with-converted-colors' };
		await getOptionalField('includeFileInfo')?.routing?.send?.preSend?.[0]?.call(
			{ getNodeParameter: () => false } as unknown as IExecuteSingleFunctions,
			includeRequest,
		);
		expect(includeRequest.headers).toEqual({ 'Include-File-Info': false });

		const responseType = getOptionalField('responseType');
		expect(responseType).toMatchObject({
			default: '',
			options: [
				{ name: 'Synchronous Response', value: '' },
				{ name: 'Request ID', value: 'requestId' },
			],
		});
		const responseRequest: IHttpRequestOptions = {
			url: '/pdf-with-converted-colors',
			headers: { Accept: 'application/json', 'Response-Type': '' },
		};
		await responseType?.routing?.send?.preSend?.[0]?.call(
			{ getNodeParameter: () => '' } as unknown as IExecuteSingleFunctions,
			responseRequest,
		);
		expect(responseRequest.headers).toEqual({ Accept: 'application/json' });
	});

	it('exposes PDF and custom profile file and resource-ID branches', () => {
		const definition = JSON.stringify(convertColorsDescription);
		expect(definition).toContain('inputFileDataFieldName');
		expect(definition).toContain('Profile Input Source');
		expect(definition).toContain('"property":"file"');
		expect(definition).toContain('"property":"profile"');

		const bodyProperties = convertColorsDescription.flatMap((field) => [
			...(field.routing?.send?.type === 'body' ? [field.routing.send.property] : []),
			...(field.options ?? []).flatMap((option) =>
				option.routing?.send?.type === 'body' ? [option.routing.send.property] : [],
			),
		]);
		expect(bodyProperties).toEqual([
			'id',
			'file',
			'color_profile',
			'profile_id',
			'profile',
			'output',
			'preserve_black',
			'rendering_intent',
		]);
	});
});
