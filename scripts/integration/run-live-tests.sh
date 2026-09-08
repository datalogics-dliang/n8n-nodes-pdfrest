#!/usr/bin/env bash

set -euo pipefail

script_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
repository_root=$(cd "$script_directory/../.." && pwd -P)
temporary_base=${RUNNER_TEMP:-${TMPDIR:-/tmp}}
diagnostics_directory=${PDFREST_DIAGNOSTICS_DIR:-}
server_pid=''

if [[ -z "${PDFREST_API_KEY:-}" ]]; then
	echo 'PDFREST_API_KEY must be set' >&2
	exit 2
fi

for command_name in curl node openssl; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		echo "Required command is unavailable: $command_name" >&2
		exit 2
	fi
done

if [[ ! -f "$repository_root/dist/nodes/PdfRest/PdfRest.node.js" ]]; then
	echo 'Build output is missing; run npm run build first' >&2
	exit 2
fi

mkdir -p "$temporary_base"
runtime_root=$(mktemp -d "$temporary_base/pdfrest-integration.XXXXXX")
if [[ -z "$diagnostics_directory" ]]; then
	diagnostics_directory=$(mktemp -d "$temporary_base/pdfrest-diagnostics.XXXXXX")
else
	mkdir -p "$diagnostics_directory"
	diagnostics_directory=$(cd "$diagnostics_directory" && pwd -P)
fi

umask 077

stop_server() {
	if [[ -z "$server_pid" ]] || ! kill -0 "$server_pid" 2>/dev/null; then
		server_pid=''
		return
	fi

	kill -INT "$server_pid" 2>/dev/null || true
	for _ in $(seq 1 40); do
		if ! kill -0 "$server_pid" 2>/dev/null; then
			wait "$server_pid" 2>/dev/null || true
			server_pid=''
			return
		fi
		sleep 0.25
	done

	kill -TERM "$server_pid" 2>/dev/null || true
	wait "$server_pid" 2>/dev/null || true
	server_pid=''
}

cleanup() {
	stop_server
	case "$runtime_root" in
		"$temporary_base"/pdfrest-integration.*) rm -rf -- "$runtime_root" ;;
		*) echo "Refusing to remove unexpected runtime path: $runtime_root" >&2 ;;
	esac
}
trap cleanup EXIT
trap 'exit 130' INT TERM

mask_value() {
	if [[ "${GITHUB_ACTIONS:-}" == 'true' ]]; then
		printf '::add-mask::%s\n' "$1"
	fi
}

n8n_user_directory="$runtime_root/n8n-user"
fixture_directory="$runtime_root/fixtures"
rendered_directory="$runtime_root/workflows"
cookie_jar="$runtime_root/cookies.txt"
login_payload="$runtime_root/login.json"
login_response="$runtime_root/login-response.json"
api_key_payload="$runtime_root/api-key.json"
api_key_response="$runtime_root/api-key-response.json"
credential_payload="$runtime_root/credential.json"

mkdir -p "$n8n_user_directory" "$rendered_directory"

if [[ -z "${PDFREST_LIVE_TOOLS_DIR:-}" ]]; then
	if ! command -v npm >/dev/null 2>&1; then
		echo 'Required command is unavailable: npm' >&2
		exit 2
	fi
	tools_directory="$runtime_root/tools"
	n8n_version=$(tr -d '[:space:]' < "$repository_root/.n8n-version")
	n8n_cli_version=$(tr -d '[:space:]' < "$repository_root/.n8n-cli-version")
	env -u PDFREST_API_KEY npm install \
		--prefix "$tools_directory" \
		--no-save \
		--no-package-lock \
		--loglevel=warn \
		"n8n@$n8n_version" \
		"@n8n/cli@$n8n_cli_version" \
		>"$diagnostics_directory/tool-install.log" 2>&1
else
	tools_directory=$(cd "$PDFREST_LIVE_TOOLS_DIR" && pwd -P)
fi

n8n_binary="$tools_directory/node_modules/.bin/n8n"
n8n_cli_binary="$tools_directory/node_modules/.bin/n8n-cli"
if [[ ! -x "$n8n_binary" || ! -x "$n8n_cli_binary" ]]; then
	echo 'Pinned n8n tools did not install correctly' >&2
	exit 1
fi

owner_email='pdfrest-ci@example.invalid'
owner_password=$(openssl rand -hex 24)
encryption_key=$(openssl rand -hex 32)
mask_value "$PDFREST_API_KEY"
mask_value "$owner_password"
mask_value "$encryption_key"

owner_password_hash=$(
	cd "$tools_directory"
	CI_OWNER_PASSWORD="$owner_password" node -e \
		"process.stdout.write(require('bcryptjs').hashSync(process.env.CI_OWNER_PASSWORD, 10))"
)
mask_value "$owner_password_hash"

export N8N_USER_FOLDER="$n8n_user_directory"
export N8N_ENCRYPTION_KEY="$encryption_key"
export N8N_HOST='127.0.0.1'
export N8N_LISTEN_ADDRESS='127.0.0.1'
export N8N_PORT=${PDFREST_N8N_PORT:-5680}
export N8N_RUNNERS_BROKER_PORT=${PDFREST_N8N_BROKER_PORT:-5681}
export N8N_PROTOCOL='http'
export N8N_SECURE_COOKIE='false'
export N8N_CUSTOM_EXTENSIONS="$repository_root/dist"
export N8N_RESTRICT_FILE_ACCESS_TO="$fixture_directory"
export N8N_LOG_LEVEL='debug'
export N8N_DIAGNOSTICS_ENABLED='false'
export N8N_VERSION_NOTIFICATIONS_ENABLED='false'
export N8N_TEMPLATES_ENABLED='false'
export N8N_PERSONALIZATION_ENABLED='false'
export N8N_INSTANCE_OWNER_MANAGED_BY_ENV='true'
export N8N_INSTANCE_OWNER_EMAIL="$owner_email"
export N8N_INSTANCE_OWNER_FIRST_NAME='CI'
export N8N_INSTANCE_OWNER_LAST_NAME='Runner'
export N8N_INSTANCE_OWNER_PASSWORD_HASH="$owner_password_hash"

if [[ "$N8N_PORT" == "$N8N_RUNNERS_BROKER_PORT" ]]; then
	echo 'PDFREST_N8N_PORT and PDFREST_N8N_BROKER_PORT must differ' >&2
	exit 2
fi

"$repository_root/scripts/integration/prepare-fixtures.sh" "$fixture_directory" >/dev/null

server_url="http://127.0.0.1:$N8N_PORT"
export N8N_URL="$server_url"

echo "Starting isolated n8n on $server_url"
"$n8n_binary" start >"$diagnostics_directory/n8n-server.log" 2>&1 &
server_pid=$!

ready='false'
for _ in $(seq 1 60); do
	if curl --silent --show-error --fail \
		--connect-timeout 2 \
		--max-time 5 \
		"$server_url/healthz/readiness" \
		>/dev/null 2>&1; then
		ready='true'
		break
	fi
	if ! kill -0 "$server_pid" 2>/dev/null; then
		break
	fi
	sleep 1
done

if [[ "$ready" != 'true' ]]; then
	echo 'n8n did not become ready within 60 seconds' >&2
	exit 1
fi

OWNER_EMAIL="$owner_email" OWNER_PASSWORD="$owner_password" node -e \
	"process.stdout.write(JSON.stringify({emailOrLdapLoginId: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD}))" \
	>"$login_payload"

curl --silent --show-error --fail-with-body \
	--connect-timeout 5 \
	--max-time 15 \
	--cookie-jar "$cookie_jar" \
	--header 'Content-Type: application/json' \
	--data-binary "@$login_payload" \
	"$server_url/rest/login" \
	>"$login_response"
node -e \
	"const r=require(process.argv[1]); if (!r.data) throw new Error('Owner login did not return data')" \
	"$login_response"

printf '%s\n' \
	'{"label":"CI bootstrap","expiresAt":null,"scopes":["credential:create","credential:list","credential:read","workflow:create","workflow:list","workflow:read","workflow:update","execution:list","execution:read"]}' \
	>"$api_key_payload"

curl --silent --show-error --fail-with-body \
	--connect-timeout 5 \
	--max-time 15 \
	--cookie "$cookie_jar" \
	--header 'Content-Type: application/json' \
	--data-binary "@$api_key_payload" \
	"$server_url/rest/api-keys/" \
	>"$api_key_response"

n8n_api_key=$(node -e \
	"const r=require(process.argv[1]); if (!r.data?.rawApiKey) throw new Error('API key creation did not return a key'); process.stdout.write(r.data.rawApiKey)" \
	"$api_key_response")
mask_value "$n8n_api_key"
export N8N_API_KEY="$n8n_api_key"

PDFREST_API_KEY_VALUE="$PDFREST_API_KEY" \
	PDFREST_BASE_URL_VALUE="${PDFREST_BASE_URL:-https://api.pdfrest.com}" \
	node -e \
	"process.stdout.write(JSON.stringify({apiKey: process.env.PDFREST_API_KEY_VALUE, baseUrl: process.env.PDFREST_BASE_URL_VALUE}))" \
	>"$credential_payload"

credential_id=$("$n8n_cli_binary" credential create \
	--type=pdfRestApi \
	--name='pdfRest CI' \
	--file="$credential_payload" \
	--format=id-only \
	2>>"$diagnostics_directory/n8n-cli.log")
credential_id=$(printf '%s' "$credential_id" | tr -d '\r\n')
if [[ -z "$credential_id" ]]; then
	echo 'n8n-cli did not return a credential ID' >&2
	exit 1
fi

# Exercise n8n's credential-level test discovery before quota-consuming workflows.
bash "$script_directory/test-credential.sh" \
	"$server_url" "$cookie_jar" "$credential_id" "$credential_payload" "$runtime_root"

export PDFREST_CREDENTIAL_ID="$credential_id"
export PDFREST_CREDENTIAL_NAME='pdfRest CI'
export PDFREST_TEST_FIXTURE_DIR="$fixture_directory"

workflow_ids=''
for workflow_name in \
	test-all-endpoints-multipart-upload \
	test-all-endpoints-json-upload; do
	source_workflow="$repository_root/test/workflows/$workflow_name.json"
	rendered_workflow="$rendered_directory/$workflow_name.json"
	node "$repository_root/scripts/integration/render-workflow.mjs" \
		--input "$source_workflow" \
		--output "$rendered_workflow" \
		>>"$diagnostics_directory/render-workflows.log"

	workflow_id=$("$n8n_cli_binary" workflow create \
		--file="$rendered_workflow" \
		--format=id-only \
		2>>"$diagnostics_directory/n8n-cli.log")
	workflow_id=$(printf '%s' "$workflow_id" | tr -d '\r\n')
	if [[ -z "$workflow_id" ]]; then
		echo "n8n-cli did not return an ID for $workflow_name" >&2
		exit 1
	fi
	workflow_ids="$workflow_ids$workflow_name:$workflow_id\n"
done

stop_server

execution_failed='false'
while IFS=: read -r workflow_name workflow_id; do
	[[ -n "$workflow_name" ]] || continue
	execution_log="$diagnostics_directory/$workflow_name.log"
	echo "Executing $workflow_name"
	if "$n8n_binary" execute \
		--id="$workflow_id" \
		--rawOutput \
		>"$execution_log" 2>&1; then
		printf 'passed\n' >"$diagnostics_directory/$workflow_name.status"
	else
		execution_failed='true'
		printf 'failed\n' >"$diagnostics_directory/$workflow_name.status"
		echo "$workflow_name failed; raw output retained only in temporary runner storage" >&2
	fi
done < <(printf '%b' "$workflow_ids")

if [[ "$execution_failed" == 'true' ]]; then
	echo 'Live integration tests failed; raw output will not be published' >&2
	exit 1
fi

echo 'Live integration tests passed'
