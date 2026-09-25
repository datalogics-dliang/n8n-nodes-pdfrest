import type { INodeProperties } from 'n8n-workflow';
import { addAttachmentDescription, addAttachmentOperation } from './addAttachment.operation';
import { addImageDescription, addImageOperation } from './addImage.operation';
import { addShapesDescription, addShapesOperation } from './addShapes.operation';
import { addTablesDescription, addTablesOperation } from './addTables.operation';
import { addTextDescription, addTextOperation } from './addText.operation';
import { blankPdfDescription, blankPdfOperation } from './blankPdf.operation';
import { compressDescription, compressOperation } from './compress.operation';
import { convertBmpDescription, convertBmpOperation } from './convertBmp.operation';
import { convertColorsDescription, convertColorsOperation } from './convertColors.operation';
import { convertExcelDescription, convertExcelOperation } from './convertExcel.operation';
import { convertGifDescription, convertGifOperation } from './convertGif.operation';
import { convertJpgDescription, convertJpgOperation } from './convertJpg.operation';
import { convertMarkdownDescription, convertMarkdownOperation } from './convertMarkdown.operation';
import { convertToPdfDescription, convertToPdfOperation } from './convertToPdf.operation';
import {
	convertPowerPointDescription,
	convertPowerPointOperation,
} from './convertPowerPoint.operation';
import { convertPngDescription, convertPngOperation } from './convertPng.operation';
import { convertPostscriptDescription, convertPostscriptOperation } from './convertPostscript.operation';
import { convertWordDescription, convertWordOperation } from './convertWord.operation';
import {
	convertXfaToAcroformsDescription,
	convertXfaToAcroformsOperation,
} from './convertXfaToAcroforms.operation';
import { convertPdfADescription, convertPdfAOperation } from './convertPdfA.operation';
import { convertPdfXDescription, convertPdfXOperation } from './convertPdfX.operation';
import { createZugferdDescription, createZugferdOperation } from './createZugferd.operation';
import { deleteResourceDescription, deleteResourceOperation } from './deleteResource.operation';
import { deleteResourcesDescription, deleteResourcesOperation } from './deleteResources.operation';
import { decryptDescription, decryptOperation } from './decrypt.operation';
import { encryptDescription, encryptOperation } from './encrypt.operation';
import { exportFormDataDescription, exportFormDataOperation } from './exportFormData.operation';
import { extractImagesDescription, extractImagesOperation } from './extractImages.operation';
import { extractTextDescription, extractTextOperation } from './extractText.operation';
import {
	flattenAnnotationsDescription,
	flattenAnnotationsOperation,
} from './flattenAnnotations.operation';
import { flattenFormsDescription, flattenFormsOperation } from './flattenForms.operation';
import { flattenLayersDescription, flattenLayersOperation } from './flattenLayers.operation';
import {
	flattenTransparenciesDescription,
	flattenTransparenciesOperation,
} from './flattenTransparencies.operation';
import { getResourceDescription, getResourceOperation } from './getResource.operation';
import { importFormDataDescription, importFormDataOperation } from './importFormData.operation';
import { linearizeDescription, linearizeOperation } from './linearize.operation';
import { mergeDescription, mergeOperation } from './merge.operation';
import { ocrDescription, ocrOperation } from './ocr.operation';
import { pdfInfoDescription, pdfInfoOperation } from './pdfInfo.operation';
import { rasterizeDescription, rasterizeOperation } from './rasterize.operation';
import { redactionApplyDescription, redactionApplyOperation } from './redactionApply.operation';
import {
	redactionPreviewDescription,
	redactionPreviewOperation,
} from './redactionPreview.operation';
import { requestStatusDescription, requestStatusOperation } from './requestStatus.operation';
import { restrictDescription, restrictOperation } from './restrict.operation';
import { setPageBoxesDescription, setPageBoxesOperation } from './setPageBoxes.operation';
import { signDescription, signOperation } from './sign.operation';
import { splitDescription, splitOperation } from './split.operation';
import { summarizeDescription, summarizeOperation } from './summarize.operation';
import { tdmReservedDescription, tdmReservedOperation } from './tdmReserved.operation';
import { convertTifDescription, convertTifOperation } from './convertTif.operation';
import { translateDescription, translateOperation } from './translate.operation';
import { unrestrictDescription, unrestrictOperation } from './unrestrict.operation';
import { unzipDescription, unzipOperation } from './unzip.operation';
import { uploadDescription, uploadOperation } from './upload.operation';
import { validateZugferdDescription, validateZugferdOperation } from './validateZugferd.operation';
import { watermarkDescription, watermarkOperation } from './watermark.operation';
import { zipDescription, zipOperation } from './zip.operation';
import { createPdfRestRequestLogger } from '../helpers/requestLogger';
import { createPdfRestRequestSanitizer } from '../helpers/requestSanitizer';
import { createInputSourceFields } from '../helpers/inputSource';
import { createDeferredMultipartUploadsPreSend } from '../helpers/multipart';
import {
	createOperationOutputDownloadFields,
	downloadOutputFiles,
} from '../helpers/outputDownload';

const headerOptionNames = ['responseType', 'includeFileInfo'];
const operationOptions = [
	addAttachmentOperation,
	addImageOperation,
	addShapesOperation,
	addTablesOperation,
	addTextOperation,
	blankPdfOperation,
	compressOperation,
	convertBmpOperation,
	convertColorsOperation,
	convertExcelOperation,
	convertGifOperation,
	convertJpgOperation,
	convertMarkdownOperation,
	convertPdfAOperation,
	convertPdfXOperation,
	convertPngOperation,
	convertPostscriptOperation,
	convertPowerPointOperation,
	convertTifOperation,
	convertToPdfOperation,
	convertWordOperation,
	convertXfaToAcroformsOperation,
	createZugferdOperation,
	decryptOperation,
	deleteResourceOperation,
	deleteResourcesOperation,
	encryptOperation,
	exportFormDataOperation,
	extractImagesOperation,
	extractTextOperation,
	flattenAnnotationsOperation,
	flattenFormsOperation,
	flattenLayersOperation,
	flattenTransparenciesOperation,
	getResourceOperation,
	importFormDataOperation,
	linearizeOperation,
	mergeOperation,
	ocrOperation,
	pdfInfoOperation,
	rasterizeOperation,
	redactionApplyOperation,
	redactionPreviewOperation,
	requestStatusOperation,
	restrictOperation,
	setPageBoxesOperation,
	signOperation,
	splitOperation,
	summarizeOperation,
	tdmReservedOperation,
	translateOperation,
	unrestrictOperation,
	unzipOperation,
	uploadOperation,
	validateZugferdOperation,
	watermarkOperation,
	zipOperation,
].sort((left, right) => String(left.action).localeCompare(String(right.action)));

function orderOptionalFields(description: INodeProperties[]): INodeProperties[] {
	return description.map((property) => {
		if (property.name !== 'options' || property.type !== 'collection' || !property.options) {
			return property;
		}

		const options = property.options as INodeProperties[];
		const otherOptions = options
			.filter((option) => !headerOptionNames.includes(option.name))
			.sort((left, right) => String(left.displayName).localeCompare(String(right.displayName)));
		const headerOptions = headerOptionNames.flatMap((name) =>
			options.filter((option) => option.name === name),
		);
		return {
			...property,
			options: [...headerOptions, ...otherOptions],
		};
	});
}

/**
 * Adds the shared multipart file branch to processing operations that still
 * expose only a primary resource ID field.
 */
function addInputFileSources(description: INodeProperties[]): INodeProperties[] {
	const operationsWithInputSources = new Set(
		description
			.filter((property) => property.name === 'inputType')
			.flatMap((property) => property.displayOptions?.show?.operation ?? [])
			.filter((operation): operation is string => typeof operation === 'string'),
	);

	return description.flatMap((property) => {
		if (
			property.name !== 'resourceId' ||
			property.routing?.send?.property !== 'id' ||
			!property.displayOptions?.show?.operation
		) {
			return [property];
		}

		const [operation] = property.displayOptions.show.operation;
		return typeof operation === 'string' && !operationsWithInputSources.has(operation)
			? createInputSourceFields({ operation, file: { deferUpload: true } })
			: [property];
	});
}

function addOutputDownloadFields(description: INodeProperties[]): INodeProperties[] {
	return description.flatMap((property) => {
		if (property.name !== 'options' || property.type !== 'collection' || !property.options) {
			return [property];
		}

		const operations = property.displayOptions?.show?.operation ?? [];
		const operation = operations.length === 1 ? operations[0] : undefined;
		if (typeof operation !== 'string') return [property];

		const outputDownloadFields = createOperationOutputDownloadFields(operation);
		if (outputDownloadFields.length === 0) return [property];
		const [downloadOutputFiles, outputFileDataFieldName] = outputDownloadFields;
		const outputTypes = outputFileDataFieldName.displayOptions?.show?.outputType;
		const dependentOptions = outputTypes ? { 'options.outputType': outputTypes } : {};

		return [
			{
				...downloadOutputFiles,
				displayOptions: {
					show: {
						operation: [operation],
						...dependentOptions,
					},
				},
			},
			{
				...outputFileDataFieldName,
				displayOptions: {
					show: {
						operation: [operation],
						downloadOutputFiles: [true],
						...dependentOptions,
					},
				},
			},
			property,
		];
	});
}

const basePdfRestDescription: INodeProperties[] = [
	{
		displayName: 'Request Sanitizer',
		name: 'requestSanitizer',
		type: 'hidden',
		default: '',
		routing: {
			send: {
				preSend: [createPdfRestRequestSanitizer()],
			},
		},
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: operationOptions,
		default: 'split',
	},
	...addAttachmentDescription,
	...addImageDescription,
	...addShapesDescription,
	...addTablesDescription,
	...addTextDescription,
	...blankPdfDescription,
	...compressDescription,
	...convertBmpDescription,
	...convertColorsDescription,
	...convertExcelDescription,
	...convertGifDescription,
	...convertJpgDescription,
	...convertMarkdownDescription,
	...convertToPdfDescription,
	...convertPngDescription,
	...convertPostscriptDescription,
	...convertPowerPointDescription,
	...convertTifDescription,
	...convertWordDescription,
	...convertXfaToAcroformsDescription,
	...convertPdfADescription,
	...convertPdfXDescription,
	...createZugferdDescription,
	...deleteResourcesDescription,
	...deleteResourceDescription,
	...decryptDescription,
	...encryptDescription,
	...exportFormDataDescription,
	...extractImagesDescription,
	...extractTextDescription,
	...flattenAnnotationsDescription,
	...flattenFormsDescription,
	...flattenLayersDescription,
	...flattenTransparenciesDescription,
	...requestStatusDescription,
	...restrictDescription,
	...ocrDescription,
	...pdfInfoDescription,
	...rasterizeDescription,
	...redactionApplyDescription,
	...redactionPreviewDescription,
	...getResourceDescription,
	...importFormDataDescription,
	...linearizeDescription,
	...mergeDescription,
	...setPageBoxesDescription,
	...signDescription,
	...splitDescription,
	...summarizeDescription,
	...tdmReservedDescription,
	...translateDescription,
	...unrestrictDescription,
	...unzipDescription,
	...uploadDescription,
	...validateZugferdDescription,
	...watermarkDescription,
	...zipDescription,
	{
		displayName: 'Output Downloader',
		name: 'outputDownloader',
		type: 'hidden',
		default: '',
		routing: {
			output: {
				postReceive: [downloadOutputFiles],
			},
		},
	},
	{
		displayName: 'Request Diagnostics',
		name: 'requestDiagnostics',
		type: 'hidden',
		default: false,
		routing: {
			send: {
				preSend: [createPdfRestRequestLogger()],
			},
		},
	},
	{
		displayName: 'Deferred Multipart Uploads',
		name: 'deferredMultipartUploads',
		type: 'hidden',
		default: '',
		routing: {
			send: {
				preSend: [createDeferredMultipartUploadsPreSend()],
			},
		},
	},
];

export const pdfRestDescription = orderOptionalFields(
	addOutputDownloadFields(addInputFileSources(basePdfRestDescription)),
);
