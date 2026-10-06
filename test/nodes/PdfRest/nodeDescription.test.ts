import { describe, expect, it } from 'vitest';
import { PdfRest } from '../../../nodes/PdfRest/PdfRest.node';

describe('pdfRest node description', () => {
	it('uses the public pdfRest API Toolkit display name', () => {
		const node = new PdfRest();

		expect(node.description.displayName).toBe('pdfRest API Toolkit');
		expect(node.description.defaults.name).toBe('pdfRest API Toolkit');
		expect(node.description.name).toBe('pdfRest');
	});

	it('describes every input source selector', () => {
		const node = new PdfRest();
		const undescribed = node.description.properties
			.filter((field) => field.displayName.endsWith('Input Source'))
			.filter((field) => !field.description?.trim())
			.map((field) => `${field.displayOptions?.show?.operation?.join(',')}: ${field.displayName}`);

		expect(undescribed).toEqual([]);
	});
});
