const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { Readable, Writable } = require("node:stream");

const DEFAULT_PREFIX = "tradeplug255";
const BLOB_PREFIX = "tradeplug255/";

function stripEnvQuotes(value) {
  const v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function truthyEnv(name) {
  const v = stripEnvQuotes(process.env[name] || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function resolveBlobEnv() {
  const storeId = stripEnvQuotes(process.env.PUB_BLOB_STORE_ID || process.env.BLOB_STORE_ID || "");
  const token = stripEnvQuotes(
    process.env.PUB_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || ""
  );
  const publicImages =
    truthyEnv("BLOB_PUBLIC_IMAGES") ||
    truthyEnv("PUB_BLOB_PUBLIC_IMAGES") ||
    Boolean(process.env.PUB_BLOB_STORE_ID);
  return { storeId, token, publicImages, isPublicStore: Boolean(process.env.PUB_BLOB_STORE_ID) };
}

function resolveObjectStorageEnv(driver = "") {
  const endpoint = stripEnvQuotes(process.env.OBJECT_STORAGE_ENDPOINT || process.env.S3_ENDPOINT || "").replace(/\/+$/, "");
  const region = stripEnvQuotes(
    process.env.OBJECT_STORAGE_REGION || process.env.S3_REGION || process.env.AWS_REGION || "auto"
  );
  const bucket = stripEnvQuotes(process.env.OBJECT_STORAGE_BUCKET || process.env.S3_BUCKET || "");
  const accessKeyId = stripEnvQuotes(
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID ||
      process.env.S3_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      ""
  );
  const secretAccessKey = stripEnvQuotes(
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ||
      process.env.S3_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      ""
  );
  const remoteDir = stripEnvQuotes(
    process.env.OBJECT_STORAGE_PREFIX || process.env.S3_PREFIX || DEFAULT_PREFIX
  ).replace(/^\/+|\/+$/g, "");
  const publicBaseUrl = stripEnvQuotes(
    process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || ""
  ).replace(/\/+$/, "");
  const requested =
    driver === "object-storage" ||
    driver === "object_storage" ||
    driver === "s3" ||
    driver === "hetzner-object-storage";
  const active = requested && Boolean(endpoint && bucket && accessKeyId && secretAccessKey && publicBaseUrl);
  return {
    active,
    driver: active ? "object-storage" : "",
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: truthyEnv("OBJECT_STORAGE_FORCE_PATH_STYLE") || truthyEnv("S3_FORCE_PATH_STYLE"),
    remoteDir: remoteDir || DEFAULT_PREFIX,
    publicBaseUrl
  };
}

function resolveFtpStorageEnv(driver = "") {
  const host = stripEnvQuotes(process.env.FTP_HOST || process.env.OVH_FTP_HOST || "");
  const username = stripEnvQuotes(
    process.env.FTP_USERNAME || process.env.FTP_USER || process.env.OVH_FTP_USERNAME || ""
  );
  const password = stripEnvQuotes(process.env.FTP_PASSWORD || process.env.OVH_FTP_PASSWORD || "");
  const port = Number(stripEnvQuotes(process.env.FTP_PORT || process.env.OVH_FTP_PORT || "")) || 21;
  const remoteDir = stripEnvQuotes(
    process.env.FTP_REMOTE_DIR || process.env.OVH_FTP_REMOTE_DIR || DEFAULT_PREFIX
  ).replace(/\/+$/, "");
  const publicBaseUrl = stripEnvQuotes(
    process.env.FTP_PUBLIC_BASE_URL || process.env.OVH_FTP_PUBLIC_BASE_URL || ""
  ).replace(/\/+$/, "");
  const requested = driver === "ftp" || driver === "ftps" || driver === "ovh" || driver === "ovh-ftp";
  const secure =
    driver === "ftps" || truthyEnv("FTP_SECURE") || truthyEnv("OVH_FTP_SECURE") || port === 990;
  const active = requested && Boolean(host && username && password && publicBaseUrl);
  return {
    active,
    driver: active ? "ftp" : "",
    host,
    port,
    username,
    password,
    secure,
    remoteDir: remoteDir || DEFAULT_PREFIX,
    publicBaseUrl
  };
}

function resolveSftpStorageEnv(driver = "") {
  const host = stripEnvQuotes(process.env.SFTP_HOST || "");
  const username = stripEnvQuotes(process.env.SFTP_USERNAME || process.env.SFTP_USER || "");
  const password = stripEnvQuotes(process.env.SFTP_PASSWORD || "");
  const privateKey = stripEnvQuotes(process.env.SFTP_PRIVATE_KEY || "");
  const port = Number(stripEnvQuotes(process.env.SFTP_PORT || "")) || 22;
  const remoteDir = stripEnvQuotes(process.env.SFTP_REMOTE_DIR || DEFAULT_PREFIX).replace(/\/+$/, "");
  const publicBaseUrl = stripEnvQuotes(process.env.SFTP_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const active =
    (driver === "sftp" || Boolean(host)) && Boolean(host && username && (password || privateKey) && publicBaseUrl);
  return {
    active,
    driver: active ? "sftp" : "",
    host,
    port,
    username,
    password,
    privateKey,
    remoteDir: remoteDir || DEFAULT_PREFIX,
    publicBaseUrl
  };
}

function resolveExternalStorageEnv() {
  const driver = stripEnvQuotes(process.env.EXTERNAL_STORAGE_DRIVER || "").toLowerCase();
  const objectStorage = resolveObjectStorageEnv(driver);
  if (objectStorage.active) return objectStorage;
  const ftpStorage = resolveFtpStorageEnv(driver);
  if (ftpStorage.active) return ftpStorage;
  return resolveSftpStorageEnv(driver);
}

function createPersistentStore({ publicDir, storageDir, isVercel = false }) {
  const external = resolveExternalStorageEnv();
  const externalActive = Boolean(external.active);
  const blob = resolveBlobEnv();
  const blobActive = Boolean(!externalActive && isVercel && (blob.token || blob.storeId));

  function localPath(relativePath) {
    return path.join(storageDir, String(relativePath || "").replace(/^\/+/, ""));
  }

  function externalRelativePath(relativePath) {
    return String(relativePath || "").replace(/^\/+/, "");
  }

  function externalRemotePath(relativePath) {
    const rel = externalRelativePath(relativePath);
    return `${external.remoteDir}/${rel}`.replace(/\/+/g, "/");
  }

  function externalObjectKey(relativePath) {
    return externalRemotePath(relativePath).replace(/^\/+/, "");
  }

  function externalPublicUrl(relativePath) {
    return `${external.publicBaseUrl}/${externalRelativePath(relativePath)}`;
  }

  function contentType(relativePath) {
    const ext = path.extname(String(relativePath || "")).toLowerCase();
    if (ext === ".json") return "application/json; charset=utf-8";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    return "application/octet-stream";
  }

  function blobPathname(relativePath) {
    return `${BLOB_PREFIX}${String(relativePath || "").replace(/^\/+/, "")}`;
  }

  function blobOptions(extra = {}) {
    const o = { ...extra };
    if (blob.token) o.token = blob.token;
    else if (blob.storeId) o.storeId = blob.storeId;
    return o;
  }

  function blobAccess() {
    return blob.isPublicStore || blob.publicImages ? "public" : "private";
  }

  function readDiskJson(relativePath, fallback) {
    const candidates = [
      localPath(relativePath),
      path.join(publicDir, String(relativePath || "").replace(/^data\//, "data/"))
    ];
    for (const filePath of candidates) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8") || "null");
        return parsed ?? fallback;
      } catch {
        continue;
      }
    }
    return fallback;
  }

  function writeDiskFile(relativePath, body) {
    const filePath = localPath(relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body);
  }

  async function withSftp(fn) {
    const SftpClient = require("ssh2-sftp-client");
    const client = new SftpClient();
    const config = { host: external.host, port: external.port, username: external.username };
    if (external.privateKey) config.privateKey = external.privateKey;
    else config.password = external.password;
    await client.connect(config);
    try {
      return await fn(client);
    } finally {
      await client.end().catch(() => {});
    }
  }

  async function withFtp(fn) {
    const ftp = require("basic-ftp");
    const client = new ftp.Client();
    await client.access({
      host: external.host,
      port: external.port,
      user: external.username,
      password: external.password,
      secure: external.secure
    });
    try {
      return await fn(client);
    } finally {
      client.close();
    }
  }

  function objectClient() {
    const { S3Client } = require("@aws-sdk/client-s3");
    return new S3Client({
      endpoint: external.endpoint,
      region: external.region,
      forcePathStyle: external.forcePathStyle,
      credentials: {
        accessKeyId: external.accessKeyId,
        secretAccessKey: external.secretAccessKey
      }
    });
  }

  async function streamToString(stream) {
    if (!stream) return "";
    if (typeof stream.transformToString === "function") return stream.transformToString("utf8");
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  }

  function bufferWritable() {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
    return { writable, toString: () => Buffer.concat(chunks).toString("utf8") };
  }

  async function readExternalText(relativePath) {
    if (!externalActive) return null;
    try {
      if (external.driver === "object-storage") {
        const { GetObjectCommand } = require("@aws-sdk/client-s3");
        const result = await objectClient().send(
          new GetObjectCommand({ Bucket: external.bucket, Key: externalObjectKey(relativePath) })
        );
        return streamToString(result.Body);
      }
      if (external.driver === "ftp") {
        return await withFtp(async (client) => {
          const out = bufferWritable();
          await client.downloadTo(out.writable, externalRemotePath(relativePath));
          return out.toString();
        });
      }
      return await withSftp(async (client) => {
        const remotePath = externalRemotePath(relativePath);
        const exists = await client.exists(remotePath);
        if (!exists) return null;
        const data = await client.get(remotePath);
        return Buffer.isBuffer(data) ? data.toString("utf8") : String(data || "");
      });
    } catch {
      return null;
    }
  }

  async function writeExternalFile(relativePath, body) {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ""), "utf8");
    if (external.driver === "object-storage") {
      const { PutObjectCommand } = require("@aws-sdk/client-s3");
      await objectClient().send(
        new PutObjectCommand({
          Bucket: external.bucket,
          Key: externalObjectKey(relativePath),
          Body: payload,
          ContentType: contentType(relativePath),
          CacheControl: /^uploads\//.test(String(relativePath || ""))
            ? "public, max-age=31536000, immutable"
            : "no-store"
        })
      );
      return;
    }
    if (external.driver === "ftp") {
      const remotePath = externalRemotePath(relativePath);
      await withFtp(async (client) => {
        await client.ensureDir(path.posix.dirname(remotePath));
        await client.uploadFrom(Readable.from(payload), path.posix.basename(remotePath));
      });
      return;
    }
    await withSftp(async (client) => {
      const remotePath = externalRemotePath(relativePath);
      await client.mkdir(path.posix.dirname(remotePath), true);
      await client.put(payload, remotePath);
    });
  }

  async function readBlobText(relativePath) {
    const { get, list } = require("@vercel/blob");
    const access = blobAccess();
    const opts = blobOptions({ access, useCache: access === "private" ? false : undefined });
    const pathname = blobPathname(relativePath);
    if (access === "public") {
      const { blobs } = await list({ ...opts, prefix: pathname, limit: 20 });
      const hit = blobs.find((b) => b.pathname === pathname);
      if (hit?.url) {
        const res = await fetch(hit.url, { cache: "no-store" });
        if (res.ok) return res.text();
      }
      return null;
    }
    const result = await get(pathname, opts);
    if (result?.statusCode === 200 && result.stream) return new Response(result.stream).text();
    return null;
  }

  async function readJson(relativePath, fallback) {
    if (externalActive) {
      const text = await readExternalText(relativePath);
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          return fallback;
        }
      }
    }
    if (blobActive) {
      try {
        const text = await readBlobText(relativePath);
        if (text) return JSON.parse(text);
      } catch {
        /* fallback disk */
      }
    }
    return readDiskJson(relativePath, fallback);
  }

  async function writeJson(relativePath, data) {
    const body = `${JSON.stringify(data, null, 2)}\n`;
    if (externalActive) return writeExternalFile(relativePath, body);
    if (blobActive) {
      const { put } = require("@vercel/blob");
      await put(
        blobPathname(relativePath),
        body,
        blobOptions({
          access: blobAccess(),
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: true
        })
      );
      return;
    }
    writeDiskFile(relativePath, body);
  }

  async function uploadImage(fileOrBuffer, ext = ".jpg") {
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(String(ext || "").toLowerCase())
      ? String(ext).toLowerCase().replace(".jpeg", ".jpg")
      : ".jpg";
    const filename = `${crypto.randomUUID()}${safeExt}`;
    const rel = `uploads/${filename}`;
    const buffer = Buffer.isBuffer(fileOrBuffer)
      ? fileOrBuffer
      : fileOrBuffer?.buffer
        ? fileOrBuffer.buffer
        : fs.readFileSync(fileOrBuffer.path);

    if (externalActive) {
      await writeExternalFile(rel, buffer);
      return externalPublicUrl(rel);
    }
    if (blobActive) {
      const { put } = require("@vercel/blob");
      const result = await put(
        blobPathname(rel),
        buffer,
        blobOptions({
          access: blobAccess(),
          contentType: contentType(rel),
          addRandomSuffix: false,
          allowOverwrite: true
        })
      );
      return result.url;
    }
    writeDiskFile(rel, buffer);
    return `/uploads/${filename}`;
  }

  async function deleteImage(imageUrl) {
    const url = String(imageUrl || "").trim();
    if (!url) return;
    if (externalActive && url.startsWith(external.publicBaseUrl)) {
      const rel = url.slice(external.publicBaseUrl.length).replace(/^\/+/, "");
      if (!rel) return;
      try {
        if (external.driver === "object-storage") {
          const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
          await objectClient().send(
            new DeleteObjectCommand({ Bucket: external.bucket, Key: externalObjectKey(rel) })
          );
        } else if (external.driver === "ftp") {
          await withFtp((client) => client.remove(externalRemotePath(rel)));
        } else {
          await withSftp(async (client) => {
            const remotePath = externalRemotePath(rel);
            if (await client.exists(remotePath)) await client.delete(remotePath);
          });
        }
      } catch {
        /* ignore */
      }
      return;
    }
    if (blobActive && /^https?:\/\//i.test(url)) {
      try {
        const { del } = require("@vercel/blob");
        await del(url, blobOptions());
      } catch {
        /* ignore */
      }
      return;
    }
    if (url.startsWith("/uploads/")) {
      try {
        fs.unlinkSync(localPath(`uploads/${path.basename(url)}`));
      } catch {
        /* ignore */
      }
    }
  }

  return {
    isActive: () => externalActive || blobActive,
    useMemoryUploads: () => externalActive || blobActive,
    publicImages: () => externalActive || blob.publicImages || blob.isPublicStore,
    storageMode: () =>
      externalActive
        ? external.driver === "object-storage"
          ? "object-storage"
          : external.driver === "ftp"
            ? "external-ftp"
            : "external-sftp"
        : blobActive
          ? "blob"
          : isVercel
            ? "vercel-static"
            : "local",
    readJson,
    writeJson,
    uploadImage,
    deleteImage
  };
}

module.exports = {
  createPersistentStore,
  resolveBlobEnv,
  resolveExternalStorageEnv,
  resolveObjectStorageEnv,
  resolveFtpStorageEnv,
  resolveSftpStorageEnv
};
