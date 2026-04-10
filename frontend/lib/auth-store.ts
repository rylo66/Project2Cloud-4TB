import { BlobServiceClient } from "@azure/storage-blob";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  provider: "local";
  createdAt: string;
};

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const containerName = process.env.AUTH_USERS_CONTAINER || "app-data";
const blobName = process.env.AUTH_USERS_BLOB || "users.json";

if (!connectionString) {
  throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING in frontend/.env.local");
}

function getBlobClient() {
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = service.getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobName);
  return { containerClient, blobClient };
}

export async function readUsers(): Promise<StoredUser[]> {
  const { containerClient, blobClient } = getBlobClient();

  await containerClient.createIfNotExists();

  const exists = await blobClient.exists();
  if (!exists) {
    await blobClient.upload(JSON.stringify([], null, 2), 2, {
      blobHTTPHeaders: { blobContentType: "application/json" },
    });
    return [];
  }

  const download = await blobClient.download();
  const text = await streamToString(download.readableStreamBody);

  if (!text.trim()) return [];
  return JSON.parse(text) as StoredUser[];
}

export async function writeUsers(users: StoredUser[]): Promise<void> {
  const { containerClient, blobClient } = getBlobClient();

  await containerClient.createIfNotExists();

  const body = JSON.stringify(users, null, 2);
  await blobClient.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const users = await readUsers();
  const match = users.find(
    (user) => user.email.trim().toLowerCase() === email.trim().toLowerCase()
  );
  return match || null;
}

async function streamToString(
  readableStream: NodeJS.ReadableStream | null | undefined
): Promise<string> {
  if (!readableStream) return "";

  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}