#!/usr/bin/env node

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORKFLOW_LOG_PATTERN = /^test-all-endpoints-.*\.log$/;
const REQUEST_MANIFEST_PREFIX = 'pdfRest request manifest ';
const SAFE_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _./()+:-]{0,127}$/;
const SAFE_LOCATIONS = new Set(['body', 'header', 'query']);
const SAFE_STATUSES = new Set(['passed', 'failed']);
const SAFE_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);

function parseJsonArrayAt(input, start) {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = start; index < input.length; index += 1) {
		const character = input[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === '"') inString = false;
			continue;
		}

		if (character === '"') inString = true;
		else if (character === '[') depth += 1;
		else if (character === ']') {
			depth -= 1;
			if (depth === 0) {
				try {
					return JSON.parse(input.slice(start, index + 1));
				} catch {
					return undefined;
				}
			}
		}
	}

	return undefined;
}

export function extractWorkflowErrors(log) {
	const groups = [];
	const propertyPattern = /"errors"\s*:\s*\[/g;
	let match;

	while ((match = propertyPattern.exec(log)) !== null) {
		const arrayStart = log.indexOf('[', match.index);
		const candidate = parseJsonArrayAt(log, arrayStart);
		if (
			Array.isArray(candidate) &&
			candidate.length > 0 &&
			candidate.every(
				(error) =>
					error &&
					typeof error === 'object' &&
					typeof error.node === 'string' &&
					error.details &&
					typeof error.details === 'object',
			)
		) {
			groups.push(candidate);
		}
	}

	if (groups.length === 0) return [];
	return groups.reduce((largest, group) => (group.length > largest.length ? group : largest), []);
}

export function extractRequestManifests(log) {
	const manifests = [];
	for (const line of log.split(/\r?\n/)) {
		const markerIndex = line.indexOf(REQUEST_MANIFEST_PREFIX);
		if (markerIndex === -1) continue;
		try {
			const manifest = JSON.parse(line.slice(markerIndex + REQUEST_MANIFEST_PREFIX.length));
			if (
				manifest &&
				typeof manifest === 'object' &&
				typeof manifest.node === 'string' &&
				Array.isArray(manifest.inputs)
			) {
				manifests.push(manifest);
			}
		} catch {
			// Ignore incomplete log lines and allow the structured error to stand alone.
		}
	}
	return manifests;
}

export function addRequestInputs(errors, manifests) {
	const inputsByNode = new Map();
	const inputsByNodeAndItem = new Map();
	for (const manifest of manifests) {
		inputsByNode.set(manifest.node, manifest.inputs);
		inputsByNodeAndItem.set(`${manifest.node}\0${manifest.itemIndex}`, manifest.inputs);
	}
	return errors.map((error) => {
		const inputs =
			error.details?.inputs ??
			inputsByNodeAndItem.get(`${error.node}\0${error.details?.itemIndex}`) ??
			inputsByNode.get(error.node);
		if (!inputs) return error;
		return { ...error, details: { ...error.details, inputs } };
	});
}

function safeLabel(value, fallback) {
	return typeof value === 'string' && SAFE_LABEL_PATTERN.test(value) ? value : fallback;
}

function safeInteger(value) {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function safeHttpStatus(value) {
	const status = safeInteger(value);
	return status !== undefined && status >= 100 && status <= 599 ? status : undefined;
}

export function classifyError(error) {
	const status = safeHttpStatus(error.details?.httpCode);
	if (status === 401 || status === 403) return 'authentication';
	if (status === 429) return 'rate-limit';
	if (status !== undefined && status >= 400 && status <= 499) return 'client-request';
	if (status !== undefined && status >= 500) return 'service-response';
	if (error.details?.name === 'NodeApiError') return 'node-api';
	if (error.details?.name === 'NodeOperationError') return 'node-operation';
	return 'execution';
}

function safeErrorDetails(error, httpStatus) {
	if (httpStatus !== undefined && httpStatus >= 400) {
		let message = 'The API rejected this request';
		if (httpStatus === 401 || httpStatus === 403) {
			message = 'The API rejected authentication or access to this operation';
		} else if (httpStatus === 404) {
			message = 'The requested resource was not found';
		} else if (httpStatus === 429) {
			message = 'The API rate limit was reached';
		} else if (httpStatus >= 500) {
			message = 'The API returned a server error';
		}
		return { errorCode: `HTTP_${httpStatus}`, message };
	}

	const name = error.details?.name;
	const rawMessage = error.details?.message;
	if (name === 'NodeOperationError' && typeof rawMessage === 'string') {
		if (
			/\bbinary (?:file|data|field)\b/i.test(rawMessage) &&
			/\b(?:missing|not found|none was found|does not contain|doesn't contain|no binary|cannot find)\b/i.test(rawMessage)
		) {
			return {
				errorCode: 'MISSING_BINARY_INPUT',
				message: 'The selected input file field is missing from this item',
			};
		}
		if (/^The input data field ".*" must include a file name\.$/.test(rawMessage)) {
			return {
				errorCode: 'MISSING_FILE_NAME',
				message: 'The input file needs a file name',
			};
		}
		if (rawMessage === 'Scale must be a number greater than zero.') {
			return {
				errorCode: 'INVALID_SCALE',
				message: 'Scale must be a number greater than zero',
			};
		}
	}

	if (name === 'OutputDownloadValidationError') {
		return {
			errorCode: 'OUTPUT_DOWNLOAD_INVALID',
			message: 'The downloaded output did not pass the workflow file check',
		};
	}
	if (name === 'UnexpectedValidationStatus') {
		return {
			errorCode: 'VALIDATION_STATUS_INVALID',
			message: 'The validation endpoint did not report a valid result',
		};
	}
	if (name === 'NodeOperationError') {
		return { errorCode: 'NODE_OPERATION', message: 'The node could not process this item' };
	}
	if (name === 'NodeApiError') {
		return { errorCode: 'NODE_API', message: 'The API request failed without an HTTP status' };
	}
	return { errorCode: 'EXECUTION', message: 'The workflow failed without a recognized error type' };
}

function sanitizeInput(input) {
	if (!input || typeof input !== 'object') return undefined;

	const location = SAFE_LOCATIONS.has(input.location) ? input.location : undefined;
	const name = safeLabel(input.requestField ?? input.name, undefined);
	const type = safeLabel(input.type, undefined);
	const mimeType = safeLabel(input.mimeType, undefined);
	const bytes = safeInteger(input.bytes);
	const sanitized = {};
	if (location) sanitized.location = location;
	if (name) sanitized.name = name;
	if (type) sanitized.type = type;
	if (mimeType) sanitized.mimeType = mimeType;
	if (bytes !== undefined) sanitized.bytes = bytes;

	return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function sanitizeError(error) {
	const itemIndex = safeInteger(error.details?.itemIndex);
	const httpStatus = safeHttpStatus(error.details?.httpCode);
	const { errorCode, message } = safeErrorDetails(error, httpStatus);
	const inputs = Array.isArray(error.details?.inputs)
		? error.details.inputs.map(sanitizeInput).filter(Boolean)
		: [];
	const sanitized = {
		node: safeLabel(error.node, 'Unknown node'),
		classification: classifyError(error),
		errorCode,
		message,
		inputs,
	};
	if (itemIndex !== undefined) sanitized.itemIndex = itemIndex;
	if (httpStatus !== undefined) sanitized.httpStatus = httpStatus;
	return sanitized;
}

function readWorkflowDiagnostics(diagnosticsDirectory, logFile) {
	const workflowName = basename(logFile, '.log');
	const statusPath = join(diagnosticsDirectory, `${workflowName}.status`);
	const rawStatus = existsSync(statusPath) ? readFileSync(statusPath, 'utf8').trim() : 'unknown';
	const status = SAFE_STATUSES.has(rawStatus) ? rawStatus : 'unknown';
	const errors = [];

	if (status === 'failed') {
		const log = readFileSync(join(diagnosticsDirectory, logFile), 'utf8');
		const extracted = addRequestInputs(extractWorkflowErrors(log), extractRequestManifests(log));
		errors.push(...extracted.map(sanitizeError));
	}

	return {
		workflow: safeLabel(workflowName, 'unknown-workflow'),
		status,
		errors,
	};
}

export function buildDiagnostics({ diagnosticsDirectory, outcome }) {
	const workflowLogs = existsSync(diagnosticsDirectory)
		? readdirSync(diagnosticsDirectory)
				.filter((file) => WORKFLOW_LOG_PATTERN.test(file))
				.sort()
		: [];

	return {
		version: 1,
		outcome: SAFE_OUTCOMES.has(outcome) ? outcome : 'unknown',
		workflows: workflowLogs.map((logFile) =>
			readWorkflowDiagnostics(diagnosticsDirectory, logFile),
		),
	};
}

export function buildArtifact(diagnostics) {
	return {
		errors: diagnostics.workflows.flatMap((workflow) => workflow.errors),
	};
}

function escapeMarkdown(value) {
	return String(value)
		.replaceAll('\\', '\\\\')
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/([`*_{}\[\]<>])/g, '\\$1')
		.slice(0, 1000);
}

export function formatError(error) {
	const lines = [`- **Node:** ${escapeMarkdown(error.node)}`];
	if (error.itemIndex !== undefined) {
		lines.push(`  - **Item index:** ${escapeMarkdown(error.itemIndex)}`);
	}
	if (error.httpStatus !== undefined) {
		lines.push(`  - **HTTP status:** ${escapeMarkdown(error.httpStatus)}`);
	}
	lines.push(`  - **Classification:** ${escapeMarkdown(error.classification)}`);
	lines.push(`  - **Error code:** ${escapeMarkdown(error.errorCode)}`);
	lines.push(`  - **Message:** ${escapeMarkdown(error.message)}`);
	if (error.inputs.length > 0) {
		lines.push('  - **Input fields:**');
		for (const input of error.inputs) {
			const identity = [input.location, input.name, input.type]
				.filter(Boolean)
				.map(escapeMarkdown)
				.join(' / ');
			const metadata = [input.mimeType, input.bytes]
				.filter((value) => value !== undefined)
				.map(escapeMarkdown)
				.join(', ');
			lines.push(`    - ${identity || 'field'}${metadata ? `: ${metadata}` : ''}`);
		}
	}
	return lines.join('\n');
}

export function buildSummary({ diagnostics, artifactName, artifactUrl }) {
	const lines = ['## Live pdfRest integration', ''];

	if (diagnostics.outcome === 'success') lines.push('✅ All live integration workflows passed.');
	else if (diagnostics.outcome === 'failure') lines.push('❌ Live integration tests failed.');
	else lines.push(`⚠️ Live integration tests ended with status: ${diagnostics.outcome}.`);

	for (const workflow of diagnostics.workflows) {
		const icon = workflow.status === 'passed' ? '✅' : workflow.status === 'failed' ? '❌' : '⚠️';
		lines.push('', `### ${icon} ${escapeMarkdown(workflow.workflow)}`);

		if (workflow.status === 'failed') {
			if (workflow.errors.length > 0) {
				lines.push('', ...workflow.errors.map(formatError));
			} else {
				lines.push(
					'',
					'The workflow failed before a safe error classification could be extracted.',
				);
			}
		} else if (workflow.status === 'passed') {
			lines.push('', 'Workflow completed successfully.');
		} else {
			lines.push('', 'No completion status was recorded for this workflow.');
		}
	}

	if (diagnostics.workflows.length === 0) {
		lines.push('', 'The harness stopped before any workflow execution log was created.');
	}

	if (diagnostics.outcome !== 'success' && artifactName && artifactUrl) {
		lines.push(
			'',
			`Sanitized diagnostics are retained for five days in [${escapeMarkdown(artifactName)}](${artifactUrl}).`,
		);
	}

	return `${lines.join('\n')}\n`;
}

export function writeSanitizedDiagnostics(output, diagnostics) {
	mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
	writeFileSync(output, `${JSON.stringify(diagnostics, null, 2)}\n`, { mode: 0o600 });
}

function readArgument(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function main() {
	const diagnosticsDirectory = readArgument('--diagnostics');
	const output = readArgument('--output');
	const artifactOutput = readArgument('--artifact-output');
	if (!diagnosticsDirectory || !output || !artifactOutput) {
		throw new Error(
			'Usage: write-github-summary.mjs --diagnostics <directory> --output <file> --artifact-output <file>',
		);
	}

	const diagnostics = buildDiagnostics({
		diagnosticsDirectory,
		outcome: process.env.LIVE_TEST_OUTCOME ?? 'unknown',
	});
	writeSanitizedDiagnostics(artifactOutput, buildArtifact(diagnostics));
	const summary = buildSummary({
		diagnostics,
		artifactName: process.env.LIVE_TEST_ARTIFACT_NAME,
		artifactUrl: process.env.LIVE_TEST_ARTIFACT_URL,
	});
	appendFileSync(output, summary);
	if (diagnostics.outcome !== 'success') process.stdout.write(summary);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
