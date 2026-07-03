import { createDb } from "@tags/db";
import {
  buildRuntimeProviderConfig,
  createRuntimeProviders,
  handleTagsMcpRequest,
  loadRuntimeSecrets,
} from "@tags/runtime";

export const runtime = "nodejs";

async function dispatch(request: Request): Promise<Response> {
  const secrets = loadRuntimeSecrets();
  if (!secrets.mcpSigningKey) {
    return new Response("Tags MCP is not configured", { status: 503 });
  }

  const providerConfig = buildRuntimeProviderConfig(secrets);
  const providers = await createRuntimeProviders(providerConfig);
  const db = createDb(secrets.databaseUrl);

  return handleTagsMcpRequest(request, {
    signingSecret: secrets.mcpSigningKey,
    db,
    providers,
    providerConfig,
    appUrl: secrets.appUrl,
  });
}

export async function GET(request: Request) {
  return dispatch(request);
}

export async function POST(request: Request) {
  return dispatch(request);
}

export async function DELETE(request: Request) {
  return dispatch(request);
}
