#!/usr/bin/env bash

set -euo pipefail

server_url=$1
cookie_jar=$2
credential_id=$3
credential_payload=$4
runtime_root=$5
request_file="$runtime_root/credential-test-request.json"
response_file="$runtime_root/credential-test-response.json"

node - "$credential_id" "$credential_payload" >"$request_file" <<'NODE'
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
process.stdout.write(JSON.stringify({
  credentials: { id: process.argv[2], name: 'pdfRest CI', type: 'pdfRestApi', data },
}));
NODE

if ! curl --silent --show-error --fail-with-body \
	--connect-timeout 5 \
	--max-time 60 \
	--cookie "$cookie_jar" \
	--header 'Content-Type: application/json' \
	--data-binary "@$request_file" \
	"$server_url/rest/credentials/test" \
	>"$response_file" 2>"$runtime_root/credential-test-curl.log"; then
	echo 'n8n credential test request failed; raw response retained only in temporary storage' >&2
	exit 1
fi

node - "$response_file" <<'NODE'
const fs = require('node:fs');
let passed = false;
try {
  passed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))?.data?.status === 'OK';
} catch {
  // Never print a raw response: n8n credential errors can contain request details.
}
if (!passed) {
  console.error('n8n credential test did not return OK');
  process.exit(1);
}
NODE

echo 'n8n credential test passed'
