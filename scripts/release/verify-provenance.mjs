import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const predicateType = 'https://slsa.dev/provenance/v1';

export async function verifyProvenance(manifest, attestations, expected, verify) {
	const { name, version, repository, commit, ref } = expected;
	if (manifest.name !== name || manifest.version !== version) {
		throw new Error('Published package name or version does not match the release');
	}
	const integrity = manifest.dist?.integrity;
	if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
		throw new Error('Published package has no supported SHA-512 integrity');
	}
	const candidates = attestations.attestations?.filter(
		(item) => item.predicateType === predicateType,
	);
	if (candidates?.length !== 1) throw new Error('Expected exactly one npm provenance attestation');
	const bundle = candidates[0].bundle;
	const workflow = `${repository}/.github/workflows/publish.yml@${ref}`;
	await verify(bundle, {
		certificateIssuer: 'https://token.actions.githubusercontent.com',
		certificateIdentityURI: workflow,
	});
	const envelope = bundle.dsseEnvelope;
	if (envelope?.payloadType !== 'application/vnd.in-toto+json') {
		throw new Error('Unsupported attestation payload type');
	}
	const statement = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
	const digest = Buffer.from(integrity.slice(7), 'base64').toString('hex');
	const subject = statement.subject;
	if (
		statement._type !== 'https://in-toto.io/Statement/v1' ||
		statement.predicateType !== predicateType ||
		subject?.length !== 1 ||
		subject[0].name !== `pkg:npm/${name.replace('@', '%40')}@${version}` ||
		subject[0].digest?.sha512 !== digest
	)
		throw new Error('Provenance subject does not match the published package');
	const build = statement.predicate?.buildDefinition;
	const source = build?.externalParameters?.workflow;
	if (
		build?.buildType !== 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1' ||
		source?.repository !== repository ||
		source?.ref !== ref ||
		source?.path !== '.github/workflows/publish.yml' ||
		!build?.resolvedDependencies?.some(
			(dependency) =>
				dependency.uri === `git+${repository}@${ref}` && dependency.digest?.gitCommit === commit,
		)
	)
		throw new Error('Provenance source does not match the release repository, tag, and commit');
}

async function getJson(url) {
	const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
	if (!response.ok) throw new Error(`Registry request failed with HTTP ${response.status}`);
	return await response.json();
}

async function main() {
	const [npmRoot, version, repositoryName, commit, ref] = process.argv.slice(2);
	if (
		!npmRoot ||
		!/^\d+\.\d+\.\d+$/.test(version ?? '') ||
		repositoryName !== 'pdfrest/n8n-nodes-pdfrest' ||
		!/^[a-f0-9]{40}$/.test(commit ?? '') ||
		ref !== `refs/tags/v${version}`
	)
		throw new Error('Invalid release verification arguments');
	// Use the verifier bundled with the workflow's pinned npm CLI, not a package runtime dependency.
	const npmRequire = createRequire(join(npmRoot, 'npm', 'package.json'));
	if (npmRequire('./package.json').version !== '11.19.0') throw new Error('Expected npm 11.19.0');
	const { verify } = npmRequire('sigstore');
	const name = '@pdfrest/n8n-nodes-pdfrest';
	const manifest = await getJson(
		`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
	);
	const url = new URL(manifest.dist?.attestations?.url);
	if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password) {
		throw new Error('Missing or unexpected npm attestation URL');
	}
	await verifyProvenance(
		manifest,
		await getJson(url),
		{
			name,
			version,
			repository: `https://github.com/${repositoryName}`,
			commit,
			ref,
		},
		verify,
	);
	console.log(`Verified provenance for ${name}@${version} at ${commit}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(`Provenance verification failed: ${error.message}`);
		process.exitCode = 1;
	});
}
