import { describe, expect, it } from 'vitest';
import { PdfRestApi } from '../../../credentials/PdfRestApi.credentials';
import { PdfRest } from '../../../nodes/PdfRest/PdfRest.node';

describe('pdfRest credential test', () => {
	it('registers GET /up directly on the credential without a body or query', () => {
		const credential = new PdfRestApi();

		expect(credential.test).toEqual({
			request: {
				method: 'GET',
				url: '={{($credentials.baseUrl === "custom" ? $credentials.customBaseUrl : $credentials.baseUrl) + "/up"}}',
			},
		});
		expect(new PdfRest().description.credentials).toEqual([{ name: 'pdfRestApi', required: true }]);
	});

	it.each(['https://api.pdfrest.com', 'https://eu-api.pdfrest.com'])(
		'sends the API key and client header to %s/up',
		async (baseUrl) => {
			const credential = new PdfRestApi();
			if (typeof credential.authenticate !== 'function')
				throw new Error('Expected function authentication');

			const request = await credential.authenticate(
				{ baseUrl, apiKey: 'test-api-key' },
				{ method: 'GET', url: `${baseUrl}/up` },
			);

			expect(request).toEqual({
				method: 'GET',
				url: `${baseUrl}/up`,
				headers: { 'Api-Key': 'test-api-key', wsn: 'n8n' },
			});
		},
	);

	it('preserves custom deployment URL normalization and keyless authentication', async () => {
		const credential = new PdfRestApi();
		if (typeof credential.authenticate !== 'function')
			throw new Error('Expected function authentication');

		expect(
			await credential.authenticate(
				{
					baseUrl: 'custom',
					customBaseUrl: 'http://pdfrest.internal:8080///',
					apiKey: 'stale-key',
				},
				{ method: 'GET', url: 'http://pdfrest.internal:8080////up' },
			),
		).toEqual({
			method: 'GET',
			url: 'http://pdfrest.internal:8080/up',
			headers: { wsn: 'n8n' },
		});
	});
});
