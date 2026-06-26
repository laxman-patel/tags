import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl?: string;
};

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function artifactObjectKey(organizationId: string, artifactId: string): string {
  return `artifacts/${organizationId}/${artifactId}`;
}

export async function uploadArtifactBody(
  client: S3Client,
  config: R2Config,
  key: string,
  body: string,
  contentType = "text/plain",
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export type ArtifactBodyReadResult =
  | { status: "found"; body: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

function isR2NotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NoSuchKey" || error.name === "NotFound")
  );
}

export async function getArtifactBody(
  client: S3Client,
  config: R2Config,
  key: string,
): Promise<ArtifactBodyReadResult> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      }),
    );
    if (!response.Body) {
      return { status: "not_found" };
    }
    const body = await response.Body.transformToString();
    return { status: "found", body };
  } catch (error) {
    if (isR2NotFoundError(error)) {
      return { status: "not_found" };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`R2 getArtifactBody failed for key "${key}":`, error);
    return { status: "error", message };
  }
}

export function publicArtifactUrl(config: R2Config, key: string): string | undefined {
  if (!config.publicBaseUrl) return undefined;
  return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
}
