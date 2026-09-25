import type {
	IAuthenticate,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';
import { CUSTOM_BASE_URL, normalizePdfRestRequestUrl } from '../nodes/PdfRest/helpers/baseUrl';

const apiKeyDescription =
	'The API key for your pdfRest account. <a href="https://pdfrest.com/apitools/?signup=true" target="_blank">Get an API key</a>.';
const baseUrlDescription =
	'Choose where pdfRest should process your files. <a href="https://docs.pdfrest.com" target="_blank">Learn about pdfRest deployment options</a>.';
const deploymentUrlDescription =
	'The web address where your pdfRest deployment receives requests. <a href="https://docs.pdfrest.com" target="_blank">Find your deployment setup instructions</a>.';

export class PdfRestApi implements ICredentialType {
	name = 'pdfRestApi';

	displayName = 'pdfRest API';

	icon: Icon = {
		light: 'file:../nodes/PdfRest/pdfrest.light.svg',
		dark: 'file:../nodes/PdfRest/pdfrest.dark.svg',
	};

	documentationUrl = 'https://docs.pdfrest.com/overview/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'options',
			options: [
				{
					name: 'https://api.pdfrest.com',
					value: 'https://api.pdfrest.com',
					description:
						'Process files with pdfRest API Toolkit Cloud in the United States. The same Cloud API key also works with the European Union URL.',
				},
				{
					name: 'https://eu-api.pdfrest.com',
					value: 'https://eu-api.pdfrest.com',
					description:
						'Process files with pdfRest API Toolkit Cloud in the European Union. The same Cloud API key also works with the United States URL.',
				},
				{
					name: 'Self-Hosted or Container Deployment',
					value: CUSTOM_BASE_URL,
					description:
						'Choose this if your organization runs its own pdfRest deployment. <a href="https://docs.pdfrest.com" target="_blank">View the deployment guides</a>.',
				},
			],
			default: 'https://api.pdfrest.com',
			required: true,
			description: baseUrlDescription,
			hint: baseUrlDescription,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: '123e4567-e89b-12d3-a456-426614174000',
			required: true,
			description: apiKeyDescription,
			hint: apiKeyDescription,
			displayOptions: {
				show: {
					baseUrl: ['https://api.pdfrest.com', 'https://eu-api.pdfrest.com'],
				},
			},
		},
		{
			displayName: 'Deployment URL',
			name: 'customBaseUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://pdfrest.example.com',
			description: deploymentUrlDescription,
			hint: deploymentUrlDescription,
			displayOptions: {
				show: {
					baseUrl: [CUSTOM_BASE_URL],
				},
			},
			validateType: 'url',
		},
		{
			displayName: 'Allowed HTTP Request Domains',
			name: 'allowedHttpRequestDomains',
			type: 'options',
			options: [
				{
					name: 'All',
					value: 'all',
					description: 'Allow all requests when used in the HTTP Request or GraphQL node',
				},
				{
					name: 'Specific Domains',
					value: 'domains',
					description: 'Restrict requests to specific domains',
				},
				{
					name: 'None',
					value: 'none',
					description: 'Block all requests when used in the HTTP Request or GraphQL node',
				},
			],
			default: 'domains',
			description:
				'Control which domains this credential can be used with in HTTP Request or GraphQL nodes',
			hint: 'Control which domains this credential can be used with in HTTP Request or GraphQL nodes. Self-Hosted or Container users may add their own domain to the list.',
		},
		{
			displayName: 'Allowed Domains',
			name: 'allowedDomains',
			type: 'string',
			default: 'api.pdfrest.com, eu-api.pdfrest.com',
			placeholder: 'example.com, *.subdomain.com',
			description: 'Comma-separated list of allowed domains (supports wildcards with *)',
			displayOptions: {
				show: {
					allowedHttpRequestDomains: ['domains'],
				},
			},
		},
	];

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: '={{($credentials.baseUrl === "custom" ? $credentials.customBaseUrl : $credentials.baseUrl) + "/up"}}',
		},
	};

	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		requestOptions.url = normalizePdfRestRequestUrl(requestOptions.url, credentials);
		const headers = { ...requestOptions.headers };

		for (const name of Object.keys(headers)) {
			if (name.toLowerCase() === 'api-key' || name.toLowerCase() === 'wsn') delete headers[name];
		}
		if (credentials.baseUrl !== CUSTOM_BASE_URL) {
			headers['Api-Key'] = String(credentials.apiKey ?? '');
		}
		headers.wsn = 'n8n';

		requestOptions.headers = headers;
		return requestOptions;
	};
}
