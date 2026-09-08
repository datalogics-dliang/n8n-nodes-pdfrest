import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { pdfRestDescription } from './actions';

export class PdfRest implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'pdfRest API Toolkit',
		name: 'pdfRest',
		icon: {
			light: 'file:pdfrest.light.svg',
			dark: 'file:pdfrest.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Convert, compress, secure, OCR, and extract PDF data, built on the Adobe PDF Library. Runs in the cloud or self-hosted.',
		defaults: {
			name: 'pdfRest API Toolkit',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'pdfRestApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL:
				'={{$credentials.baseUrl === "custom" ? $credentials.customBaseUrl : $credentials.baseUrl}}',
			headers: {
				Accept: 'application/json',
			},
		},
		properties: pdfRestDescription,
	};
}
