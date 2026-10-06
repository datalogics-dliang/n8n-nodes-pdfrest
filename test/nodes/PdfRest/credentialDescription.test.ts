import { describe, expect, it } from 'vitest';
import { PdfRestApi } from '../../../credentials/PdfRestApi.credentials';

describe('pdfRest credential description', () => {
	it('offers hosted regions and a described custom deployment option', () => {
		const credential = new PdfRestApi();
		const apiKey = credential.properties.find((property) => property.name === 'apiKey');
		const baseUrl = credential.properties.find((property) => property.name === 'baseUrl');

		expect(credential.properties.map((property) => property.name)).toEqual([
			'baseUrl',
			'apiKey',
			'customBaseUrl',
			'allowedHttpRequestDomains',
			'allowedDomains',
		]);
		expect(apiKey).toMatchObject({
			type: 'string',
			placeholder: '123e4567-e89b-12d3-a456-426614174000',
			required: true,
			description: expect.any(String),
			hint: expect.any(String),
			displayOptions: {
				show: {
					baseUrl: ['https://api.pdfrest.com', 'https://eu-api.pdfrest.com'],
				},
			},
		});
		expect(apiKey?.hint).toBe(apiKey?.description);
		expect(apiKey?.description).toContain('The API key for your pdfRest account.');
		expect(apiKey?.description).not.toContain('or deployment');
		expect(apiKey?.description).toContain('https://pdfrest.com/apitools/?signup=true');
		expect(baseUrl).toMatchObject({
			displayName: 'API Base URL',
			type: 'options',
			default: 'https://api.pdfrest.com',
			required: true,
			options: [
				{
					name: 'https://api.pdfrest.com',
					value: 'https://api.pdfrest.com',
					description: expect.any(String),
				},
				{
					name: 'https://eu-api.pdfrest.com',
					value: 'https://eu-api.pdfrest.com',
					description: expect.any(String),
				},
				{
					name: 'Self-Hosted or Container Deployment',
					value: 'custom',
					description: expect.any(String),
				},
			],
			description: expect.any(String),
			hint: expect.any(String),
		});
		expect(baseUrl?.hint).toBe(baseUrl?.description);
		expect(baseUrl?.description).toContain('https://docs.pdfrest.com');
		const hostedOptions = baseUrl?.options?.slice(0, 2) ?? [];
		for (const option of hostedOptions) {
			expect(option.description).toContain('same Cloud API key');
		}
	});

	it('adds API authentication only for Cloud deployments', async () => {
		const credential = new PdfRestApi();
		expect(credential.authenticate).toEqual(expect.any(Function));
		if (typeof credential.authenticate !== 'function')
			throw new Error('Expected function authentication');

		const cloudRequest = await credential.authenticate(
			{ baseUrl: 'https://api.pdfrest.com/', apiKey: 'cloud-key' },
			{ url: 'https://api.pdfrest.com//compress', headers: { Accept: 'application/json' } },
		);
		expect(cloudRequest).toMatchObject({
			url: 'https://api.pdfrest.com/compress',
			headers: { Accept: 'application/json', 'Api-Key': 'cloud-key', wsn: 'n8n' },
		});

		const customRequest = await credential.authenticate(
			{
				baseUrl: 'custom',
				customBaseUrl: 'http://pdfrest.internal:8080///',
				apiKey: 'stale-key',
			},
			{
				url: 'http://pdfrest.internal:8080///compress',
				headers: { Accept: 'application/json', 'Api-Key': 'stale-key', WSN: 'stale-client' },
			},
		);
		expect(customRequest).toMatchObject({
			url: 'http://pdfrest.internal:8080/compress',
			headers: { Accept: 'application/json', wsn: 'n8n' },
		});
	});

	it('restricts generic HTTP requests to the pdfRest Cloud domains by default', () => {
		const credential = new PdfRestApi();
		const domainMode = credential.properties.find(
			(property) => property.name === 'allowedHttpRequestDomains',
		);
		const allowedDomains = credential.properties.find(
			(property) => property.name === 'allowedDomains',
		);

		expect(domainMode).toMatchObject({
			displayName: 'Allowed HTTP Request Domains',
			type: 'options',
			default: 'domains',
			options: expect.arrayContaining([
				{ name: 'Specific Domains', value: 'domains', description: expect.any(String) },
			]),
			hint: expect.stringContaining(
				'Control which domains this credential can be used with in HTTP Request or GraphQL nodes',
			),
		});
		expect(domainMode?.hint).toContain(
			'Self-Hosted or Container users may add their own domain to the list',
		);
		expect(allowedDomains).toMatchObject({
			displayName: 'Allowed Domains',
			type: 'string',
			default: 'api.pdfrest.com, eu-api.pdfrest.com',
			displayOptions: {
				show: { allowedHttpRequestDomains: ['domains'] },
			},
		});
	});

	it('requires a valid deployment URL only for the custom option', () => {
		const credential = new PdfRestApi();
		const deploymentUrl = credential.properties.find(
			(property) => property.name === 'customBaseUrl',
		);

		expect(deploymentUrl).toMatchObject({
			displayName: 'Deployment URL',
			type: 'string',
			default: '',
			required: true,
			validateType: 'url',
			description: expect.any(String),
			hint: expect.any(String),
			displayOptions: { show: { baseUrl: ['custom'] } },
		});
		expect(deploymentUrl?.hint).toBe(deploymentUrl?.description);
		expect(deploymentUrl?.description).toContain(
			'web address where your pdfRest deployment receives requests',
		);
		expect(deploymentUrl?.description).toContain('https://docs.pdfrest.com');
	});
});
