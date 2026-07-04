import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
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

export type R2Storage = {
  client: S3Client;
  config: R2Config;
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

export function spaceMemoryPrefix(organizationId: string, spaceId: string): string {
  return `memory/${organizationId}/${spaceId}`;
}

export function spaceMemoryObjectKey(organizationId: string, spaceId: string): string {
  return `${spaceMemoryPrefix(organizationId, spaceId)}/MEMORY.md`;
}

export function spaceMemoryManifestObjectKey(organizationId: string, spaceId: string): string {
  return `${spaceMemoryPrefix(organizationId, spaceId)}/MANIFEST.json`;
}

export function spaceMemoryHistoryPrefix(organizationId: string, spaceId: string): string {
  return `${spaceMemoryPrefix(organizationId, spaceId)}/history`;
}

export function spaceMemoryHistoryObjectKey(
  organizationId: string,
  spaceId: string,
  revisionId: string,
): string {
  return `${spaceMemoryHistoryPrefix(organizationId, spaceId)}/${revisionId}/MEMORY.md`;
}

export function spaceMemoryHistoryManifestObjectKey(
  organizationId: string,
  spaceId: string,
  revisionId: string,
): string {
  return `${spaceMemoryHistoryPrefix(organizationId, spaceId)}/${revisionId}/MANIFEST.json`;
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

export type TextObjectReadResult =
  | { status: "found"; body: string; etag?: string; lastModified?: Date }
  | { status: "not_found" };

export type ConditionalPutResult =
  | { status: "written"; etag?: string }
  | { status: "conflict" };

function isR2NotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NoSuchKey" || error.name === "NotFound")
  );
}

function isR2PreconditionError(error: unknown): boolean {
  const maybe = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return maybe?.name === "PreconditionFailed" || maybe?.$metadata?.httpStatusCode === 412;
}

export async function getTextObjectWithEtag(
  client: S3Client,
  config: R2Config,
  key: string,
): Promise<TextObjectReadResult> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      }),
    );
    if (!response.Body) return { status: "not_found" };
    return {
      status: "found",
      body: await response.Body.transformToString(),
      etag: response.ETag,
      lastModified: response.LastModified,
    };
  } catch (error) {
    if (isR2NotFoundError(error)) return { status: "not_found" };
    throw error;
  }
}

export async function putTextObjectConditional(
  client: S3Client,
  config: R2Config,
  key: string,
  body: string,
  options?: {
    contentType?: string;
    ifMatch?: string;
    ifNoneMatch?: string;
  },
): Promise<ConditionalPutResult> {
  try {
    const response = await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: body,
        ContentType: options?.contentType ?? "text/plain; charset=utf-8",
        IfMatch: options?.ifMatch,
        IfNoneMatch: options?.ifNoneMatch,
      }),
    );
    return { status: "written", etag: response.ETag };
  } catch (error) {
    if (isR2PreconditionError(error)) return { status: "conflict" };
    throw error;
  }
}

export async function copyObject(
  client: S3Client,
  config: R2Config,
  sourceKey: string,
  destinationKey: string,
): Promise<void> {
  await client.send(
    new CopyObjectCommand({
      Bucket: config.bucketName,
      CopySource: `${config.bucketName}/${sourceKey}`,
      Key: destinationKey,
    }),
  );
}

export async function listObjectKeys(
  client: S3Client,
  config: R2Config,
  prefix: string,
): Promise<Array<{ key: string; lastModified?: Date; size?: number }>> {
  const objects: Array<{ key: string; lastModified?: Date; size?: number }> = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (object.Key) {
        objects.push({
          key: object.Key,
          lastModified: object.LastModified,
          size: object.Size,
        });
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
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
