import type { R2Config } from "@tags/storage";
import { createR2Client, getArtifactBody } from "@tags/storage";
import type { Env } from "@/env";

export function getR2Config(env: Env): R2Config | null {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  ) {
    return null;
  }

  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  };
}

export function createR2ClientFromEnv(env: Env) {
  const config = getR2Config(env);
  if (!config) return null;
  return { client: createR2Client(config), config };
}

export async function fetchArtifactBodyFromR2(env: Env, contentRef: string) {
  const r2 = createR2ClientFromEnv(env);
  if (!r2) return null;
  return await getArtifactBody(r2.client, r2.config, contentRef);
}
