import { describe, expect, it } from 'vitest';
import { pdfRestDescription } from '../../../../nodes/PdfRest/actions';

describe('pdfRest description', () => {
	it('registers every implemented operation', () => {
		const operation = pdfRestDescription.find((field) => field.name === 'operation');
		const options = operation?.options ?? [];

		expect(options).toHaveLength(57);
		expect(options.map((option) => option.action)).toEqual([
			'Analyze · Summarize PDF (AI)',
			'Analyze · Translate PDF (AI)',
			'Analyze · Validate ZUGFeRD PDF',
			'Convert · File or Webpage to PDF',
			'Convert · PDF to BMP Images',
			'Convert · PDF to Excel (XLSX)',
			'Convert · PDF to GIF Images',
			'Convert · PDF to JPG Images (JPEG)',
			'Convert · PDF to Markdown',
			'Convert · PDF to PDF/A (Archival)',
			'Convert · PDF to PDF/X (Print)',
			'Convert · PDF to PNG Images',
			'Convert · PDF to PostScript',
			'Convert · PDF to PowerPoint (PPTX)',
			'Convert · PDF to TIFF Images',
			'Convert · PDF to Word (DOCX)',
			'Extract · Images from PDF',
			'Extract · OCR PDF (Make Searchable)',
			'Extract · Query PDF Info (Metadata)',
			'Extract · Text from PDF',
			'Files · Delete File by ID',
			'Files · Delete Files by ID',
			'Files · Poll for Request Status',
			'Files · Retrieve Files by ID',
			'Files · Unzip Archive',
			'Files · Upload Files or URLs',
			'Files · ZIP Output Files',
			'Forms · Export Form Data',
			'Forms · Flatten PDF Forms',
			'Forms · Import Form Data',
			'Forms · XFA to AcroForms',
			'Modify · Add Attachment to PDF',
			'Modify · Add Image to PDF',
			'Modify · Add Shapes to PDF',
			'Modify · Add Tables to PDF',
			'Modify · Add Text to PDF',
			'Modify · Create Blank PDF',
			'Modify · Create ZUGFeRD PDF',
			'Modify · Merge PDFs',
			'Modify · Set Page Boxes (Crop, Trim)',
			'Modify · Split PDF',
			'Optimize · Compress PDF',
			'Optimize · Convert PDF Colors',
			'Optimize · Flatten Annotations',
			'Optimize · Flatten Layers',
			'Optimize · Flatten Transparencies',
			'Optimize · Linearize PDF (Fast Web View)',
			'Optimize · Rasterize PDF',
			'Secure · Add Watermark to PDF',
			'Secure · Decrypt PDF (Remove Password)',
			'Secure · Encrypt PDF (Add Password)',
			'Secure · Redact PDF Text (Apply)',
			'Secure · Redact PDF Text (Preview)',
			'Secure · Remove PDF Restrictions',
			'Secure · Restrict PDF Permissions',
			'Secure · Sign PDF (Digital Signature)',
			'Secure · TDM Reserve PDF',
		]);
	});

	it('uses exactly one Input File-default source selector for every eligible operation', () => {
		const selectors = pdfRestDescription.filter((field) => field.name === 'inputType');

		expect(selectors).toHaveLength(51);
		for (const selector of selectors) {
			expect(selector.default).toBe('inputFile');
		}

		const selectorCounts = selectors.reduce<Record<string, number>>((counts, selector) => {
			for (const operation of selector.displayOptions?.show?.operation ?? []) {
				if (typeof operation === 'string') counts[operation] = (counts[operation] ?? 0) + 1;
			}
			return counts;
		}, {});
		expect(Object.values(selectorCounts)).toEqual(new Array(51).fill(1));
	});

	it('sorts operations alphabetically by bucketed action text', () => {
		const operation = pdfRestDescription.find((field) => field.name === 'operation');
		const actions = operation?.options?.map((option) => String(option.action)) ?? [];

		expect(actions).toEqual([...actions].sort((left, right) => left.localeCompare(right)));
	});

	it('provides user-friendly dropdown descriptions for every operation', () => {
		const operation = pdfRestDescription.find((field) => field.name === 'operation');
		const options = operation?.options ?? [];

		expect(options).toHaveLength(57);
		for (const option of options) {
			expect(option.description, `${String(option.name)} description`).toEqual(expect.any(String));
			expect(
				option.description?.trim().length,
				`${String(option.name)} description`,
			).toBeGreaterThan(0);
			expect(option.description, `${String(option.name)} description`).not.toMatch(/\.$/);
		}
	});

	it('registers request hooks for every operation', () => {
		const requestSanitizer = pdfRestDescription.find((field) => field.name === 'requestSanitizer');
		const outputDownloader = pdfRestDescription.find((field) => field.name === 'outputDownloader');
		const requestDiagnostics = pdfRestDescription.find(
			(field) => field.name === 'requestDiagnostics',
		);
		const requestDiagnosticsIndex = pdfRestDescription.findIndex(
			(field) => field.name === 'requestDiagnostics',
		);
		const deferredMultipartUploadsIndex = pdfRestDescription.findIndex(
			(field) => field.name === 'deferredMultipartUploads',
		);

		expect(requestSanitizer).toMatchObject({
			type: 'hidden',
			routing: { send: {} },
		});
		expect(requestSanitizer?.routing?.send?.preSend).toHaveLength(1);
		expect(outputDownloader).toMatchObject({
			type: 'hidden',
			routing: { output: {} },
		});
		expect(outputDownloader?.routing?.output?.postReceive).toHaveLength(1);
		expect(requestDiagnostics).toMatchObject({
			type: 'hidden',
			default: false,
			routing: { send: {} },
		});
		expect(requestDiagnostics?.routing?.send?.preSend).toHaveLength(1);
		expect(requestDiagnosticsIndex).toBe(deferredMultipartUploadsIndex - 1);
	});

	it('adds disabled-by-default output download controls only to file-producing operations', () => {
		const optionalFields = pdfRestDescription.filter(
			(field) => field.name === 'options' && field.type === 'collection',
		);
		for (const field of optionalFields) {
			expect(field.options?.map((option) => option.name)).not.toEqual(
				expect.arrayContaining(['downloadOutputFiles', 'outputFileDataFieldName']),
			);
		}

		const downloadFields = pdfRestDescription.filter(
			(field) => field.name === 'downloadOutputFiles',
		);
		const operationsWithDownloads = downloadFields.flatMap(
			(field) => field.displayOptions?.show?.operation ?? [],
		);

		expect(downloadFields).toHaveLength(50);
		expect(operationsWithDownloads).toHaveLength(50);
		expect(operationsWithDownloads).not.toEqual(
			expect.arrayContaining([
				'deleteResource',
				'deleteResources',
				'getRequestStatus',
				'getResource',
				'pdfInfo',
				'upload',
				'validateZugferd',
			]),
		);

		for (const download of downloadFields) {
			const operation = download.displayOptions?.show?.operation?.[0];
			const coupledOutputField = pdfRestDescription.find(
				(property) =>
					property.name === 'outputFileDataFieldName' &&
					typeof operation === 'string' &&
					property.displayOptions?.show?.operation?.includes(operation),
			);
			expect(download).toMatchObject({
				displayName: 'Download Output Files',
				type: 'boolean',
				default: false,
				description: expect.stringMatching(/^Whether to/),
			});
			expect(coupledOutputField?.displayOptions?.show).toMatchObject({
				downloadOutputFiles: [true],
			});
			expect(pdfRestDescription.findIndex((property) => property === coupledOutputField)).toBe(
				pdfRestDescription.indexOf(download) + 1,
			);
		}

		expect(
			downloadFields.find((field) => field.displayOptions?.show?.operation?.includes('compress'))
				?.displayOptions,
		).toEqual({ show: { operation: ['compress'] } });
		expect(
			downloadFields.find((field) =>
				field.displayOptions?.show?.operation?.includes('convertMarkdown'),
			)?.displayOptions,
		).toEqual({
			show: { operation: ['convertMarkdown'], 'options.outputType': ['file'] },
		});
	});

	it('uses output field name prefixes for operations that can produce multiple files', () => {
		const getOutputField = (operation: string) =>
			pdfRestDescription.find(
				(property) =>
					property.name === 'outputFileDataFieldName' &&
					property.displayOptions?.show?.operation?.includes(operation),
			);

		expect(getOutputField('split')).toMatchObject({
			displayName: 'Output File Data Field Name Prefix',
			default: 'data',
			displayOptions: {
				show: {
					operation: ['split'],
					downloadOutputFiles: [true],
				},
			},
		});
		expect(getOutputField('unzip')?.displayName).toBe('Output File Data Field Name Prefix');
		expect(getOutputField('compress')).toMatchObject({
			displayName: 'Output File Data Field Name',
			default: 'data',
		});
		expect(getOutputField('convertMarkdown')?.displayOptions).toEqual({
			show: {
				operation: ['convertMarkdown'],
				downloadOutputFiles: [true],
				'options.outputType': ['file'],
			},
		});
		expect(getOutputField('compress')?.displayOptions).toEqual({
			show: {
				operation: ['compress'],
				downloadOutputFiles: [true],
			},
		});
	});

	it('puts response headers first in Optional Fields menus', () => {
		const optionalFields = pdfRestDescription.filter(
			(field) => field.name === 'options' && field.type === 'collection',
		);

		for (const field of optionalFields) {
			const optionNames = field.options?.map((option) => option.name) ?? [];
			const headerNames = ['responseType', 'includeFileInfo'].filter(
				(name) => optionNames.includes(name),
			);
			const otherDisplayNames =
				field.options
					?.filter((option) => !headerNames.includes(option.name))
					.map((option) => String(option.displayName)) ?? [];

			expect(optionNames.slice(0, headerNames.length)).toEqual(headerNames);
			expect(otherDisplayNames).toEqual(
				[...otherDisplayNames].sort((left, right) => left.localeCompare(right)),
			);
		}
	});
});
