import type { CloudInitOptions } from "./types.js";

function indentBlock(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export function buildOpenClawConfig(options: CloudInitOptions): string {
  return JSON.stringify(
    {
      env: {
        OPENROUTER_API_KEY: options.openRouterApiKey,
      },
      agents: {
        defaults: {
          model: {
            primary: options.openclawModel,
          },
        },
      },
      gateway: {
        bind: "loopback",
        auth: {
          mode: "token",
          token: options.gatewayToken,
        },
      },
      channels: {
        telegram: {
          botToken: options.telegramBotToken,
        },
      },
    },
    null,
    2,
  );
}

export function buildDockerCompose(options: CloudInitOptions): string {
  return [
    "services:",
    "  openclaw-gateway:",
    `    image: ${options.openclawImage}`,
    "    restart: unless-stopped",
    "    init: true",
    "    environment:",
    "      HOME: /home/node",
    "      TERM: xterm-256color",
    "      TZ: UTC",
    "    volumes:",
    "      - /opt/openclaw/state:/home/node/.openclaw",
    "      - /opt/openclaw/workspace:/home/node/.openclaw/workspace",
    "    ports:",
    "      - \"127.0.0.1:18789:18789\"",
    "    healthcheck:",
    "      test:",
    "        [",
    "          \"CMD\",",
    "          \"node\",",
    "          \"-e\",",
    "          \"fetch('http://127.0.0.1:18789/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
    "        ]",
    "      interval: 30s",
    "      timeout: 5s",
    "      retries: 5",
    "      start_period: 20s",
    "    command:",
    "      [",
    "        \"node\",",
    "        \"dist/index.js\",",
    "        \"gateway\",",
    "        \"--bind\",",
    "        \"loopback\",",
    "        \"--port\",",
    "        \"18789\"",
    "      ]",
  ].join("\n");
}

export function buildCloudInit(options: CloudInitOptions): string {
  const openclawConfig = buildOpenClawConfig(options);
  const dockerCompose = buildDockerCompose(options);
  const reportScript = `#!/usr/bin/env bash
set -euo pipefail
stage="$1"
details="''"
if [ "$#" -gt 1 ]; then
  details="$2"
fi
payload="{\\"deploymentId\\":\\"${options.deploymentId}\\",\\"token\\":\\"${options.bootstrapToken}\\",\\"stage\\":\\"${"$"}stage\\"}"
if [ "${"$"}details" != "''" ]; then
  payload="${"$"}{payload%?},\\"details\\":${"$"}details}"
fi
curl -fsS -X POST '${options.callbackUrl}' -H 'Content-Type: application/json' --data "${"$"}payload" >/dev/null || true
`;
  const bootstrapScript = `#!/usr/bin/env bash
set -euo pipefail
trap '/opt/openclaw/report-stage.sh failed "{\\"reason\\":\\"bootstrap_error\\"}"' ERR

mkdir -p /opt/openclaw/state /opt/openclaw/workspace
/opt/openclaw/report-stage.sh cloud_init_started
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl docker.io docker-compose-plugin
systemctl enable --now docker
/opt/openclaw/report-stage.sh docker_installed
cd /opt/openclaw
docker compose up -d
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18789/healthz >/dev/null; then
    /opt/openclaw/report-stage.sh openclaw_started
    exit 0
  fi
  sleep 5
done
/opt/openclaw/report-stage.sh failed "{\\"reason\\":\\"healthz_timeout\\"}"
exit 1
`;

  return `#cloud-config
package_update: true

write_files:
  - path: /opt/openclaw/state/openclaw.json
    permissions: "0600"
    owner: root:root
    content: |
${indentBlock(openclawConfig, 6)}
  - path: /opt/openclaw/docker-compose.yml
    permissions: "0644"
    owner: root:root
    content: |
${indentBlock(dockerCompose, 6)}
  - path: /opt/openclaw/report-stage.sh
    permissions: "0755"
    owner: root:root
    content: |
${indentBlock(reportScript, 6)}
  - path: /opt/openclaw/bootstrap.sh
    permissions: "0755"
    owner: root:root
    content: |
${indentBlock(bootstrapScript, 6)}

runcmd:
  - [ bash, -lc, "/opt/openclaw/bootstrap.sh" ]
`;
}

