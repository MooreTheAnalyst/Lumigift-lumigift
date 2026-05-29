type SecretsMap = Record<string, string>;

const AWS_PROVIDER = "aws";
const VAULT_PROVIDER = "vault";

function parseSecretPayload(payload: string): SecretsMap {
  payload = payload.trim();
  if (!payload) return {};

  // Prefer JSON payloads, but fall back to simple KEY=VALUE lines.
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed).reduce<SecretsMap>((acc, [key, value]) => {
        if (typeof value !== "undefined") acc[key] = String(value);
        return acc;
      }, {});
    }
  } catch {
    // Not JSON, try simple line-based format.
  }

  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce<SecretsMap>((acc, line) => {
      const [key, ...rest] = line.split("=");
      if (!key) return acc;
      acc[key.trim()] = rest.join("=").trim();
      return acc;
    }, {});
}

function mergeSecrets(secrets: SecretsMap): void {
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) continue;
    if (process.env[key]) continue;
    process.env[key] = value;
  }
}

async function loadAwsSecrets(): Promise<void> {
  const secretId = process.env.AWS_SECRETS_MANAGER_SECRET_ID;
  const region = process.env.AWS_REGION;

  if (!secretId) {
    throw new Error("AWS_SECRETS_MANAGER_SECRET_ID must be set when SECRET_MANAGER_PROVIDER=aws");
  }
  if (!region) {
    throw new Error("AWS_REGION must be set when SECRET_MANAGER_PROVIDER=aws");
  }

  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const client = new SecretsManagerClient({ region });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (!result.SecretString) {
    throw new Error("AWS Secrets Manager returned an empty secret string");
  }

  mergeSecrets(parseSecretPayload(result.SecretString));
}

async function loadVaultSecrets(): Promise<void> {
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  const secretPath = process.env.VAULT_SECRET_PATH;

  if (!vaultAddr) {
    throw new Error("VAULT_ADDR must be set when SECRET_MANAGER_PROVIDER=vault");
  }
  if (!vaultToken) {
    throw new Error("VAULT_TOKEN must be set when SECRET_MANAGER_PROVIDER=vault");
  }
  if (!secretPath) {
    throw new Error("VAULT_SECRET_PATH must be set when SECRET_MANAGER_PROVIDER=vault");
  }

  const normalizedAddr = vaultAddr.replace(/\/+$/, "");
  const normalizedPath = secretPath.replace(/^\/+/, "");
  const response = await fetch(`${normalizedAddr}/v1/${normalizedPath}`, {
    headers: {
      "X-Vault-Token": vaultToken,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Vault secret fetch failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  const data = body?.data?.data ?? body?.data;

  if (!data || typeof data !== "object") {
    throw new Error("Vault response did not contain a valid secret payload");
  }

  mergeSecrets(
    Object.entries(data).reduce<SecretsMap>((acc, [key, value]) => {
      if (typeof value !== "undefined") acc[key] = String(value);
      return acc;
    }, {})
  );
}

export async function loadSecretManagerEnv(): Promise<void> {
  const provider = process.env.SECRET_MANAGER_PROVIDER?.toLowerCase();
  if (!provider) {
    return;
  }

  switch (provider) {
    case AWS_PROVIDER:
      await loadAwsSecrets();
      break;
    case VAULT_PROVIDER:
      await loadVaultSecrets();
      break;
    default:
      throw new Error(`Unsupported SECRET_MANAGER_PROVIDER: ${provider}`);
  }
}
