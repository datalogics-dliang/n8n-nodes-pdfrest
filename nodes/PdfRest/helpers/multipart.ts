import {
	NodeOperationError,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type PreSendAction,
} from 'n8n-workflow';

interface MultipartUploadOptions {
	binaryDataPropertyNameParameter: string;
	fileFieldName: string;
}

const deferredMultipartUploads = new WeakMap<IHttpRequestOptions, MultipartUploadOptions[]>();

function appendMultipartValue(formData: FormData, name: string, value: unknown): void {
	if (value instanceof Blob) {
		formData.append(name, value);
		return;
	}

	if (Array.isArray(value)) {
		if (value.some((entry) => typeof entry === 'object' && entry !== null)) {
			formData.append(name, JSON.stringify(value));
			return;
		}

		for (const entry of value) formData.append(name, String(entry));
		return;
	}

	if (typeof value === 'object' && value !== null) {
		formData.append(name, JSON.stringify(value));
		return;
	}

	formData.append(name, String(value));
}

function appendRequestBodyFields(
	formData: FormData,
	body: IHttpRequestOptions['body'],
	excludedFieldNames: string[] = [],
): void {
	if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) {
		return;
	}

	for (const [name, value] of Object.entries(body)) {
		if (excludedFieldNames.includes(name) || value === undefined || value === null) {
			continue;
		}

		appendMultipartValue(formData, name, value);
	}
}

function getBinaryDataPropertyNames(value: unknown, parameterName: string): string[] {
	const rawNames = Array.isArray(value) ? value : [value];
	if (
		rawNames.length < 1 ||
		rawNames.some((name) => typeof name !== 'string' || name.trim().length < 1)
	) {
		throw new Error(`The ${parameterName} parameter must identify at least one input data field.`);
	}

	return rawNames.map((name) => (name as string).trim());
}

export async function appendBinaryData(
	context: IExecuteSingleFunctions,
	formData: FormData,
	binaryDataPropertyName: string,
	fileFieldName: string,
): Promise<void> {
	const binaryData = context.helpers.assertBinaryData(binaryDataPropertyName);
	if (!binaryData.fileName) {
		throw new NodeOperationError(
			context.getNode(),
			`The input data field "${binaryDataPropertyName}" must include a file name.`,
		);
	}

	const fileBuffer = await context.helpers.getBinaryDataBuffer(binaryDataPropertyName);
	const file = new Blob([Uint8Array.from(fileBuffer)], { type: binaryData.mimeType });
	formData.append(fileFieldName, file, binaryData.fileName);
}

function removeContentTypeHeader(requestOptions: IHttpRequestOptions): void {
	if (requestOptions.headers) {
		requestOptions.headers = Object.fromEntries(
			Object.entries(requestOptions.headers).filter(
				([name]) => name.toLowerCase() !== 'content-type',
			),
		);
	}
}

export function createMultipartFormData(
	requestOptions: IHttpRequestOptions,
	excludedFieldNames: string[] = [],
): FormData {
	const formData = new FormData();
	appendRequestBodyFields(formData, requestOptions.body, excludedFieldNames);
	removeContentTypeHeader(requestOptions);
	return formData;
}

/**
 * Creates a declarative routing hook that converts the existing body fields
 * into multipart form data.
 */
export function createMultipartFormDataPreSend(): PreSendAction {
	return async function setupMultipartFormData(
		this: IExecuteSingleFunctions,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const formData = createMultipartFormData(requestOptions);
		requestOptions.body = formData as unknown as IHttpRequestOptions['body'];
		return requestOptions;
	};
}

/**
 * Creates a declarative routing hook that replaces the request body with one
 * or more multipart file fields from the input item's binary data.
 */
export function createMultipartUploadPreSend({
	binaryDataPropertyNameParameter,
	fileFieldName,
}: MultipartUploadOptions): PreSendAction {
	return async function setupMultipartUpload(
		this: IExecuteSingleFunctions,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		let binaryDataPropertyNames: string[];
		try {
			binaryDataPropertyNames = getBinaryDataPropertyNames(
				this.getNodeParameter(binaryDataPropertyNameParameter),
				binaryDataPropertyNameParameter,
			);
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				error instanceof Error ? error.message : 'At least one input data field is required.',
			);
		}

		const formData = createMultipartFormData(requestOptions, [fileFieldName]);
		for (const binaryDataPropertyName of binaryDataPropertyNames) {
			await appendBinaryData(this, formData, binaryDataPropertyName, fileFieldName);
		}

		requestOptions.body = formData as unknown as IHttpRequestOptions['body'];
		return requestOptions;
	};
}

/**
 * Defers multipart conversion until all operation-specific body preparation
 * hooks have completed. This preserves JSON serialization for complex inputs.
 */
export function createDeferredMultipartUploadPreSend(
	options: MultipartUploadOptions,
): PreSendAction {
	return async function deferMultipartUpload(
		this: IExecuteSingleFunctions,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const uploads = deferredMultipartUploads.get(requestOptions) ?? [];
		uploads.push(options);
		deferredMultipartUploads.set(requestOptions, uploads);
		return requestOptions;
	};
}

/** Applies any file uploads registered by declarative input-source fields. */
export function createDeferredMultipartUploadsPreSend(): PreSendAction {
	return async function applyDeferredMultipartUploads(
		this: IExecuteSingleFunctions,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const uploads = deferredMultipartUploads.get(requestOptions);
		if (!uploads) return requestOptions;
		const formData = createMultipartFormData(
			requestOptions,
			uploads.map(({ fileFieldName }) => fileFieldName),
		);

		for (const upload of uploads) {
			let binaryDataPropertyNames: string[];
			try {
				binaryDataPropertyNames = getBinaryDataPropertyNames(
					this.getNodeParameter(upload.binaryDataPropertyNameParameter),
					upload.binaryDataPropertyNameParameter,
				);
			} catch (error) {
				throw new NodeOperationError(
					this.getNode(),
					error instanceof Error ? error.message : 'At least one input data field is required.',
				);
			}

			for (const binaryDataPropertyName of binaryDataPropertyNames) {
				await appendBinaryData(this, formData, binaryDataPropertyName, upload.fileFieldName);
			}
		}
		requestOptions.body = formData as unknown as IHttpRequestOptions['body'];
		deferredMultipartUploads.delete(requestOptions);
		return requestOptions;
	};
}
