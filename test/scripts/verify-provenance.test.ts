import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error CI helper is plain ESM and has no TypeScript declarations.
import { verifyProvenance } from '../../scripts/release/verify-provenance.mjs';

const expected = {
	name: '@pdfrest/n8n-nodes-pdfrest',
	version: '0.2.0',
	repository: 'https://github.com/pdfrest/n8n-nodes-pdfrest',
	commit: 'a'.repeat(40),
	ref: 'refs/tags/v0.2.0',
};
function fixture() {
	const manifest = {
		name: expected.name,
		version: expected.version,
		dist: { integrity: `sha512-${Buffer.alloc(64).toString('base64')}` },
	};
	const statement = {
		_type: 'https://in-toto.io/Statement/v1',
		predicateType: 'https://slsa.dev/provenance/v1',
		subject: [
			{ name: 'pkg:npm/%40pdfrest/n8n-nodes-pdfrest@0.2.0', digest: { sha512: '00'.repeat(64) } },
		],
		predicate: {
			buildDefinition: {
				buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
				externalParameters: {
					workflow: {
						repository: expected.repository,
						ref: expected.ref,
						path: '.github/workflows/publish.yml',
					},
				},
				resolvedDependencies: [
					{
						uri: `git+${expected.repository}@${expected.ref}`,
						digest: { gitCommit: expected.commit },
					},
				],
			},
		},
	};
	return { manifest, statement };
}
function attestations(statement: ReturnType<typeof fixture>['statement']) {
	return {
		attestations: [
			{
				predicateType: statement.predicateType,
				bundle: {
					dsseEnvelope: {
						payloadType: 'application/vnd.in-toto+json',
						payload: Buffer.from(JSON.stringify(statement)).toString('base64'),
					},
				},
			},
		],
	};
}
describe('published provenance verification', () => {
	it('requires cryptographic verification with the exact workflow identity', async () => {
		const { manifest, statement } = fixture();
		const verify = vi.fn().mockResolvedValue(undefined);
		await verifyProvenance(manifest, attestations(statement), expected, verify);
		expect(verify).toHaveBeenCalledWith(expect.any(Object), {
			certificateIssuer: 'https://token.actions.githubusercontent.com',
			certificateIdentityURI: `${expected.repository}/.github/workflows/publish.yml@${expected.ref}`,
		});
	});
	it('rejects missing provenance', async () => {
		await expect(
			verifyProvenance(fixture().manifest, { attestations: [] }, expected, vi.fn()),
		).rejects.toThrow('exactly one');
	});
	it('propagates signature or certificate verification failures', async () => {
		const { manifest, statement } = fixture();
		await expect(
			verifyProvenance(
				manifest,
				attestations(statement),
				expected,
				vi.fn().mockRejectedValue(new Error('Invalid signature')),
			),
		).rejects.toThrow('Invalid signature');
	});
	it.each(['version', 'digest', 'repository', 'commit', 'tag', 'workflow'] as const)(
		'rejects a mismatched %s',
		async (field) => {
			const { manifest, statement } = fixture();
			const build = statement.predicate.buildDefinition;
			if (field === 'version') manifest.version = '0.3.0';
			if (field === 'digest') statement.subject[0].digest.sha512 = 'ff'.repeat(64);
			if (field === 'repository')
				build.externalParameters.workflow.repository = 'https://github.com/other/repo';
			if (field === 'commit') build.resolvedDependencies[0].digest.gitCommit = 'b'.repeat(40);
			if (field === 'tag') build.externalParameters.workflow.ref = 'refs/tags/v0.3.0';
			if (field === 'workflow')
				build.externalParameters.workflow.path = '.github/workflows/other.yml';
			await expect(
				verifyProvenance(manifest, attestations(statement), expected, vi.fn()),
			).rejects.toThrow();
		},
	);
});
