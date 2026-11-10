/** Minimal GitHub REST client for the sync worker. No dependencies beyond fetch. */

export const GITHUB_API = "https://api.github.com";
const USER_AGENT = "ai-skills-hub";

export interface GitHubRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  archived: boolean;
  pushed_at: string | null;
  license: { spdx_id: string | null; name?: string } | null;
  default_branch: string;
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTree {
  sha: string;
  truncated: boolean;
  tree: GitHubTreeEntry[];
}

export interface ParsedRepo {
  owner: string;
  name: string;
}

function encodeRef(ref: string): string {
  return ref.split("/").map(encodeURIComponent).join("/");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function rateLimitReset(response: Response): string {
  const raw = response.headers.get("x-ratelimit-reset");
  if (!raw) return "unknown";
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return raw;
  return new Date(seconds * 1000).toISOString();
}

/** GET a GitHub API path with bearer auth and actionable rate-limit errors. */
export async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("User-Agent", USER_AGENT);
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = `${GITHUB_API}${path.startsWith("/") ? "" : "/"}${path}`;
  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });

  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = rateLimitReset(response);
    const detail = remaining === "0" ? "rate limit exhausted" : "request blocked";
    throw new Error(
      `GitHub API ${detail} (HTTP ${response.status}); limit resets at ${reset}`,
    );
  }

  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`GitHub API ${response.status} for ${path}: ${body || response.statusText}`);
  }

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`GitHub API returned invalid JSON for ${path}: ${text.slice(0, 300)}`);
  }
}

export function getRepo(owner: string, name: string): Promise<GitHubRepo> {
  return githubRequest<GitHubRepo>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
  );
}

export function getTree(owner: string, name: string, ref: string): Promise<GitHubTree> {
  return githubRequest<GitHubTree>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/trees/${encodeRef(ref)}?recursive=1`,
  );
}

export async function getLatestCommitSha(
  owner: string,
  name: string,
  ref: string,
): Promise<string> {
  const commit = await githubRequest<{ sha: string }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeRef(ref)}`,
  );
  if (!commit?.sha) throw new Error(`GitHub commit ${owner}/${name}@${ref} has no sha`);
  return commit.sha;
}

/** Fetch a raw blob with a hard byte cap. Redirects (raw CDN) are followed by fetch. */
export async function fetchRawFile(
  owner: string,
  name: string,
  ref: string,
  path: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; text: string }> {
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(
    name,
  )}/${encodeRef(ref)}/${encodePath(path)}`;
  // GitHub raw returns 501 on empty files when Node negotiates gzip transfer
  // encoding; requesting identity is the documented, stable workaround.
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, Accept: "*/*", "Accept-Encoding": "identity" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`raw.githubusercontent.com ${response.status} for ${path}: ${body}`);
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Raw file ${path} is ${declared} bytes (cap ${maxBytes})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Raw file ${path} is ${buffer.byteLength} bytes (cap ${maxBytes})`);
  }
  return { buffer, text: buffer.toString("utf8") };
}

/** Accepts `owner/name` or a github.com HTTPS URL (optional `.git`). */
export function parseRepo(input: string): ParsedRepo | null {
  const value = input.trim();
  if (!value) return null;

  let owner = "";
  let name = "";
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    owner = parts[0] ?? "";
    name = parts[1] ?? "";
  } else {
    const parts = value.split("/");
    if (parts.length !== 2) return null;
    owner = parts[0] ?? "";
    name = parts[1] ?? "";
  }

  name = name.replace(/\.git$/i, "");
  const valid = /^[A-Za-z0-9_.-]+$/;
  if (!valid.test(owner) || !valid.test(name)) return null;
  if (owner === "." || owner === ".." || name === "." || name === "..") return null;
  return { owner, name };
}
