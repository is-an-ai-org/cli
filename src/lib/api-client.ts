import type { DNSRecord, HostingResponse, HostingStatus, Subdomain } from "../types.js";

const API_BASE = "https://api.is-an.ai";

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; jwt?: string } = {}
): Promise<T> {
  const { method = "GET", body, jwt } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "is-an-ai-cli",
  };
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((error as { message?: string }).message || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function checkAvailability(name: string): Promise<{ available: boolean; error?: string }> {
  return request(`/v2/domain/available/${encodeURIComponent(name)}`);
}

export async function createSubdomain(
  jwt: string,
  data: { subdomainName: string; description: string; record: DNSRecord[] }
): Promise<Subdomain> {
  return request("/v3/domain", { method: "POST", body: data, jwt });
}

export async function updateSubdomain(
  jwt: string,
  name: string,
  data: { description?: string; record?: DNSRecord[] }
): Promise<Subdomain> {
  return request(`/v3/domain/${encodeURIComponent(name)}`, { method: "PUT", body: data, jwt });
}

export async function deleteSubdomain(jwt: string, name: string): Promise<void> {
  await request(`/v3/domain/${encodeURIComponent(name)}`, { method: "DELETE", jwt });
}

export async function listMySubdomains(jwt: string): Promise<Subdomain[]> {
  return request("/v3/domain/my", { jwt });
}

export async function exchangeGithubToken(githubToken: string): Promise<{
  token: string;
  user: { id: string; name: string; email: string };
}> {
  return request("/v1/user/auth/github/device", {
    method: "POST",
    body: { github_access_token: githubToken },
  });
}

function getMimeType(filepath: string): string {
  const ext = filepath.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html", css: "text/css", js: "application/javascript",
    json: "application/json", png: "image/png", jpg: "image/jpeg",
    jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml",
    ico: "image/x-icon", webp: "image/webp", woff2: "font/woff2",
    woff: "font/woff", txt: "text/plain", xml: "application/xml",
    webmanifest: "application/manifest+json", wasm: "application/wasm",
  };
  return (ext && types[ext]) || "application/octet-stream";
}

export async function deployHosting(
  jwt: string,
  name: string,
  files: Map<string, Buffer>
): Promise<HostingResponse> {
  const encodedName = encodeURIComponent(name);
  const fileEntries = Array.from(files.entries()).map(([path, content]) => ({
    path,
    content,
    size: content.length,
    contentType: getMimeType(path),
  }));

  // Step 1: Get presigned upload URLs
  const prepareRes = await request<{ uploadUrls: { path: string; url: string }[] }>(
    `/v3/hosting/${encodedName}/prepare`,
    {
      method: "POST",
      body: { files: fileEntries.map((f) => ({ path: f.path, size: f.size, contentType: f.contentType })) },
      jwt,
    }
  );

  // Step 2: Upload files directly to S3
  const urlMap = new Map(prepareRes.uploadUrls.map((u) => [u.path, u.url]));
  await Promise.all(
    fileEntries.map(async (entry) => {
      const uploadUrl = urlMap.get(entry.path);
      if (!uploadUrl) throw new Error(`No upload URL for ${entry.path}`);
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": entry.contentType },
        body: new Uint8Array(entry.content),
      });
      if (!res.ok) throw new Error(`Upload failed for ${entry.path}: ${res.status}`);
    })
  );

  // Step 3: Confirm deployment
  return request<HostingResponse>(`/v3/hosting/${encodedName}/confirm`, {
    method: "POST",
    body: { files: fileEntries.map((f) => ({ path: f.path, size: f.size })) },
    jwt,
  });
}

export async function getHosting(jwt: string, name: string): Promise<HostingStatus> {
  return request(`/v3/hosting/${encodeURIComponent(name)}`, { jwt });
}

export async function deleteHosting(jwt: string, name: string): Promise<void> {
  await request(`/v3/hosting/${encodeURIComponent(name)}`, { method: "DELETE", jwt });
}
