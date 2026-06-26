import type { ArtifactBodyReadResult } from "@tags/storage";
import {
  createR2Client,
  getArtifactBody,
  getR2ConfigFromEnvVars,
} from "@tags/storage";
import type { Env } from "@/env";

export function getR2Config(env: Env) {
  return getR2ConfigFromEnvVars({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  });
}

export function createR2ClientFromEnv(env: Env) {
  const config = getR2Config(env);
  if (!config) return null;
  return { client: createR2Client(config), config };
}

export async function fetchArtifactBodyFromR2(
  env: Env,
  contentRef: string,
): Promise<ArtifactBodyReadResult> {
  const r2 = createR2ClientFromEnv(env);
  if (!r2) {
    return { status: "error", message: "R2 is not configured" };
  }
  return await getArtifactBody(r2.client, r2.config, contentRef);
}
