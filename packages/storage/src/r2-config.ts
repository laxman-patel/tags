import type { R2Config } from "./r2";

/** R2 credential fields sourced from environment (e.g. process.env). */
export type R2EnvVars = {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicBaseUrl?: string;
};

/** Single loader for R2 config — used by runtime write path and web read path. */
export function getR2ConfigFromEnvVars(vars: R2EnvVars): R2Config | null {
  if (
    !vars.accountId ||
    !vars.accessKeyId ||
    !vars.secretAccessKey ||
    !vars.bucketName
  ) {
    return null;
  }

  return {
    accountId: vars.accountId,
    accessKeyId: vars.accessKeyId,
    secretAccessKey: vars.secretAccessKey,
    bucketName: vars.bucketName,
    publicBaseUrl: vars.publicBaseUrl,
  };
}

export function getR2ConfigFromProcessEnv(): R2Config | null {
  return getR2ConfigFromEnvVars({
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  });
}
