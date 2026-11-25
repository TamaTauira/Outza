import { S3Client } from "@aws-sdk/client-s3";
export function getBucketConfig() {
    return {
        bucketName: process.env.AWS_BUCKET_NAME ?? "",
        folderPrefix: process.env.AWS_FOLDER_PREFIX ?? ""
    };
}
export function r2Endpoint(): string | undefined {
    return process.env.AWS_ENDPOINT_URL_S3 || process.env.S3_ENDPOINT || undefined;
}
export function createS3Client() {
    const endpoint = r2Endpoint();
    return new S3Client({
        region: process.env.AWS_REGION ?? "auto",
        ...(endpoint ? { endpoint, forcePathStyle: true } : {})
    });
}

const MISSING_STORE = "Set AWS_BUCKET_NAME and either AWS_REGION or AWS_ENDPOINT_URL_S3 (S3_ENDPOINT is also accepted), plus AWS_FOLDER_PREFIX and credentials, so files land in the same store as ingest.";
const BAD_ENDPOINT = "The storage endpoint must be an absolute URL. The value is not printed.";

/** Bucket and endpoint host for an apply run. The host never includes userinfo, path, or query. */
export function storageApplyTarget(): { ok: true; bucket: string; endpointHost: string } | { ok: false; message: string } {
    const bucket = process.env.AWS_BUCKET_NAME ?? "";
    const endpoint = r2Endpoint();
    if (!bucket || !(process.env.AWS_REGION || endpoint)) return { ok: false, message: MISSING_STORE };
    if (!endpoint) return { ok: true, bucket, endpointHost: `${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com` };
    try {
        const host = new URL(endpoint).host;
        if (!host) return { ok: false, message: BAD_ENDPOINT };
        return { ok: true, bucket, endpointHost: host };
    } catch {
        return { ok: false, message: BAD_ENDPOINT };
    }
}
