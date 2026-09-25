import {
	NodeOperationError,
	type IBinaryData,
	type IExecuteSingleFunctions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type INodeProperties,
	type PostReceiveAction,
} from 'n8n-workflow';
import { getPdfRestBaseUrl } from './baseUrl';

interface OutputDownloadFieldOptions {
	multipleFiles?: boolean;
	showWhen?: Record<string, Array<string | number | boolean>>;
}

const operationsWithoutOutputDownloads = new Set([
	'deleteResource',
	'deleteResources',
	'getResource',
	'getRequestStatus',
	'pdfInfo',
	'upload',
	'validateZugferd',
]);
const multipleOutputFileOperations = new Set([
	'convertBmp',
	'convertGif',
	'convertJpg',
	'convertPng',
	'convertTif',
	'extractImages',
	'split',
	'unzip',
]);
const fileOutputTypeOperations = new Set([
	'convertMarkdown',
	'extractText',
	'summarize',
	'translate',
]);

function getResponseHeader(response: IN8nHttpFullResponse, headerName: string): string | undefined {
	const header = Object.entries(response.headers).find(
		([name]) => name.toLowerCase() === headerName.toLowerCase(),
	)?.[1];

	if (Array.isArray(header)) {
		return typeof header[0] === 'string' ? header[0] : undefined;
	}

	return typeof header === 'string' ? header : undefined;
}

function decodeContentDispositionFilename(
	contentDisposition: string | undefined,
): string | undefined {
	if (!contentDisposition) return undefined;

	const encodedFilename = /filename\*\s*=\s*([^;]+)/i.exec(contentDisposition)?.[1]?.trim();
	if (encodedFilename) {
		const unquoted = encodedFilename.replace(/^"|"$/g, '');
		const encodedValue = /^[^']*'[^']*'(.*)$/.exec(unquoted)?.[1] ?? unquoted;

		try {
			return decodeURIComponent(encodedValue);
		} catch {
			return encodedValue;
		}
	}

	const filenameMatch = /filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]+))/i.exec(contentDisposition);
	const filename = filenameMatch?.[1]?.replace(/\\([\\"])/g, '$1') ?? filenameMatch?.[2]?.trim();

	return filename || undefined;
}

function responseBodyToBuffer(
	context: IExecuteSingleFunctions,
	response: IN8nHttpFullResponse,
): Buffer {
	if (Buffer.isBuffer(response.body)) return response.body;
	if (response.body instanceof ArrayBuffer) return Buffer.from(response.body);
	if (ArrayBuffer.isView(response.body)) {
		return Buffer.from(response.body.buffer, response.body.byteOffset, response.body.byteLength);
	}
	if (typeof response.body === 'string') return Buffer.from(response.body);

	throw new NodeOperationError(
		context.getNode(),
		'The downloaded file response was not binary data.',
	);
}

export async function prepareDownloadedBinaryData(
	context: IExecuteSingleFunctions,
	response: IN8nHttpFullResponse,
	downloadUrl: string,
): Promise<IBinaryData> {
	const fileName = decodeContentDispositionFilename(
		getResponseHeader(response, 'content-disposition'),
	);
	const mimeType = getResponseHeader(response, 'content-type')?.split(';', 1)[0]?.trim();
	const binaryData = await context.helpers.prepareBinaryData(
		responseBodyToBuffer(context, response),
		fileName,
		mimeType,
	);
	binaryData.directory = downloadUrl;

	return binaryData;
}

function getOutputResourceIds(item: INodeExecutionData, operation: string): string[] {
	const outputId = item.json.outputId;
	if (typeof outputId === 'string' && outputId.length > 0) return [outputId];
	if (Array.isArray(outputId)) {
		return outputId.filter(
			(value): value is string => typeof value === 'string' && value.length > 0,
		);
	}

	if (operation !== 'unzip' || !Array.isArray(item.json.files)) return [];

	return item.json.files.flatMap((file) => {
		if (!file || typeof file !== 'object' || Array.isArray(file)) return [];
		const resourceId = file.id;
		return typeof resourceId === 'string' && resourceId.length > 0 ? [resourceId] : [];
	});
}

function getOutputFieldName(prefix: string, outputIndex: number): string {
	return outputIndex === 0 ? prefix : `${prefix}_${outputIndex}`;
}

async function downloadResource(
	context: IExecuteSingleFunctions,
	baseUrl: string,
	resourceId: string,
): Promise<IBinaryData> {
	const downloadUrl = `${baseUrl}/resource/${encodeURIComponent(resourceId)}?format=file`;
	const response = (await context.helpers.httpRequestWithAuthentication.call(
		context,
		'pdfRestApi',
		{
			method: 'GET',
			url: downloadUrl,
			headers: { Accept: '*/*' },
			encoding: 'arraybuffer',
			returnFullResponse: true,
		},
	)) as IN8nHttpFullResponse;

	return await prepareDownloadedBinaryData(context, response, downloadUrl);
}

export const downloadOutputFiles: PostReceiveAction = async function downloadOutputFiles(
	items,
): Promise<INodeExecutionData[]> {
	if (this.getNodeParameter('downloadOutputFiles', false) !== true) return items;

	const operation = this.getNodeParameter('operation');
	if (typeof operation !== 'string' || operationsWithoutOutputDownloads.has(operation)) {
		return items;
	}

	const itemResourceIds = items.map((item) => getOutputResourceIds(item, operation));
	if (itemResourceIds.every((resourceIds) => resourceIds.length === 0)) return items;

	const outputFieldName = this.getNodeParameter('outputFileDataFieldName', 'data');
	const outputFieldNamePrefix = typeof outputFieldName === 'string' ? outputFieldName.trim() : '';
	if (outputFieldNamePrefix.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Output File Data Field Name must not be empty.');
	}
	for (const [itemIndex, item] of items.entries()) {
		for (const outputIndex of itemResourceIds[itemIndex].keys()) {
			const fieldName = getOutputFieldName(outputFieldNamePrefix, outputIndex);
			if (item.binary?.[fieldName]) {
				throw new NodeOperationError(
					this.getNode(),
					`The output file data field "${fieldName}" already exists.`,
				);
			}
		}
	}

	const credentials = await this.getCredentials('pdfRestApi');
	const baseUrl = getPdfRestBaseUrl(credentials);
	const outputItems: INodeExecutionData[] = [];

	for (const [itemIndex, item] of items.entries()) {
		const resourceIds = itemResourceIds[itemIndex];
		if (resourceIds.length === 0) {
			outputItems.push(item);
			continue;
		}

		const binary = { ...item.binary };
		for (const [outputIndex, resourceId] of resourceIds.entries()) {
			const fieldName = getOutputFieldName(outputFieldNamePrefix, outputIndex);
			binary[fieldName] = await downloadResource(this, baseUrl, resourceId);
		}

		outputItems.push({
			...item,
			binary,
		});
	}

	return outputItems;
};

function createOutputDownloadFields({
	multipleFiles = false,
	showWhen,
}: OutputDownloadFieldOptions = {}): INodeProperties[] {
	const displayOptions = showWhen ? { show: showWhen } : undefined;
	const outputFieldLabel = multipleFiles
		? 'Output File Data Field Name Prefix'
		: 'Output File Data Field Name';
	const outputFieldDescription = multipleFiles
		? 'The prefix for output file fields; additional files append _1, _2, and so on'
		: 'The name of the output field where the downloaded file is stored';

	return [
		{
			displayName: 'Download Output Files',
			name: 'downloadOutputFiles',
			type: 'boolean',
			default: false,
			displayOptions,
			description: 'Whether to download completed output files and return them as file data',
			hint: 'Whether to download completed output files and return them as file data',
		},
		{
			displayName: outputFieldLabel,
			name: 'outputFileDataFieldName',
			type: 'string',
			default: 'data',
			displayOptions,
			description: outputFieldDescription,
			hint: outputFieldDescription,
		},
	];
}

export function createOperationOutputDownloadFields(operation: string): INodeProperties[] {
	if (operationsWithoutOutputDownloads.has(operation)) return [];

	return createOutputDownloadFields({
		multipleFiles: multipleOutputFileOperations.has(operation),
		showWhen: fileOutputTypeOperations.has(operation) ? { outputType: ['file'] } : undefined,
	});
}
