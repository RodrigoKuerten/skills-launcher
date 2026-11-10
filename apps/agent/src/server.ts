import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { HOST_IDS, type HostId } from "@skills-hub/core";
import { isKnownHost } from "./adapters.js";
import { detectAgents } from "./detect.js";
import {
  assertSlug,
  fetchManifest,
  findUpdates,
  installManifest,
  listInstalled,
  removeSkill,
  rollback,
  type InstallResult,
} from "./installer.js";
import { appendJournal, getOrCreateToken, readState, tokenPath, updateState } from "./store.js";
import { marketplaceToken, reportInstallation, type ReportStatus } from "./report.js";
import { configureAutoUpdate, stopAutoUpdate } from "./autoupdate.js";

const DEFAULT_PORT = 4780;
const BODY_LIMIT = 1024 * 1024;
const DEFAULT_APP_URL = "http://localhost:3000";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RunningAgent {
  server: Server;
  port: number;
  url: string;
  token: string;
  close: () => Promise<void>;
}

export interface StartOptions {
  port?: number;
  token?: string;
}

type JsonObject = Record<string, unknown>;

function parsePort(value: string | number | undefined): number {
  if (value === undefined || value === "") return DEFAULT_PORT;
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid PORT: ${value}`);
  return port;
}

function defaultAppUrl(): string {
  return process.env.MARKETPLACE_URL?.trim() || DEFAULT_APP_URL;
}

function allowedOrigins(): string[] {
  const raw =
    process.env.AGENT_ALLOWED_ORIGINS?.trim() || "http://localhost:3000,http://127.0.0.1:3000";
  return raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("pragma", "no-cache");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(body);
}

function tokenMatches(provided: string | string[] | undefined, expected: string): boolean {
  const value = Array.isArray(provided) ? provided[0] : provided;
  if (!value) return false;
  const actual = Buffer.from(value, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function requireHostHeader(request: IncomingMessage, port: number): void {
  const host = (request.headers.host ?? "").toLowerCase();
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(host)) throw new HttpError(403, "Invalid Host header.");
}

function applyCors(request: IncomingMessage, response: ServerResponse, origins: string[]): void {
  response.setHeader("Vary", "Origin");
  const origin = request.headers.origin;
  if (!origin) return;
  if (!origins.includes(origin)) throw new HttpError(403, "Origin not allowed.");
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Agent-Token");
  response.setHeader("Access-Control-Max-Age", "600");
  if (request.headers["access-control-request-private-network"] === "true") {
    response.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > BODY_LIMIT) {
    throw new HttpError(413, "Request body is larger than 1 MB.");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > BODY_LIMIT) throw new HttpError(413, "Request body is larger than 1 MB.");
    chunks.push(buffer);
  }
  if (total === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return parsed as JsonObject;
}

function requireString(body: JsonObject, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `"${key}" must be a non-empty string.`);
  }
  return value;
}

function optionalString(body: JsonObject, key: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `"${key}" must be a non-empty string.`);
  }
  return value;
}

function requireHost(value: unknown, key: string): HostId {
  if (typeof value !== "string" || !isKnownHost(value)) {
    throw new HttpError(400, `"${key}" must be one of: ${HOST_IDS.join(", ")}.`);
  }
  return value;
}

function hostList(body: JsonObject): HostId[] | undefined {
  const value = body.hosts;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, '"hosts" must be a non-empty array of host ids.');
  }
  const hosts = value.map((entry, index) => requireHost(entry, `hosts[${index}]`));
  return [...new Set(hosts)];
}

function isMutation(request: IncomingMessage): boolean {
  return request.method === "POST";
}

async function reportResult(
  installation: Parameters<typeof reportInstallation>[0],
  status: ReportStatus,
  appUrl: string,
): Promise<void> {
  if (!marketplaceToken()) return;
  const result = await reportInstallation(installation, status, appUrl);
  if (!result.reported) {
    await appendJournal({ op: "report", host: installation.host, slug: installation.skillSlug, ok: false, error: result.message });
  }
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  configuredAppUrl: string,
): Promise<void> {
  const method = request.method ?? "GET";
  const path = url.pathname;

  if (method === "GET" && path === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      name: "@skills-hub/agent",
      version: "0.1.0",
      uptimeSeconds: Math.round(process.uptime()),
    });
    return;
  }

  if (method === "GET" && path === "/api/agents") {
    sendJson(response, 200, { agents: await detectAgents() });
    return;
  }

  if (method === "POST" && path === "/api/detect") {
    await readJson(request);
    sendJson(response, 200, { agents: await detectAgents() });
    return;
  }

  if (method === "GET" && path === "/api/installed") {
    sendJson(response, 200, { installations: await listInstalled() });
    return;
  }

  if (method === "GET" && path === "/api/settings") {
    const state = await readState();
    sendJson(response, 200, { autoUpdate: state.autoUpdate });
    return;
  }

  if (method === "POST" && path === "/api/settings") {
    const body = await readJson(request);
    if (typeof body.autoUpdate !== "boolean") {
      throw new HttpError(400, '"autoUpdate" must be a boolean.');
    }
    await updateState((state) => {
      state.autoUpdate = body.autoUpdate as boolean;
    });
    configureAutoUpdate(body.autoUpdate, configuredAppUrl);
    await appendJournal({ op: "SETTINGS", autoUpdate: body.autoUpdate });
    sendJson(response, 200, { autoUpdate: body.autoUpdate });
    return;
  }

  if (method === "GET" && path === "/api/updates") {
    const appUrl = url.searchParams.get("appUrl") || configuredAppUrl;
    sendJson(response, 200, await findUpdates(appUrl));
    return;
  }

  if (method === "POST" && path === "/api/install") {
    const body = await readJson(request);
    if ("projectDir" in body) {
      throw new HttpError(400, '"projectDir" is not accepted from the local HTTP API.');
    }
    const slug = requireString(body, "slug");
    assertSlug(slug);
    const appUrl = optionalString(body, "appUrl") ?? configuredAppUrl;
    let hosts = hostList(body);
    if (!hosts) {
      const agents = await detectAgents();
      hosts = agents
        .filter((agent) => agent.detected && agent.autoInstall && agent.supportsAgentSkills)
        .map((agent) => agent.host);
      if (hosts.length === 0) throw new HttpError(400, "No installable agents detected.");
    }

    const manifest = await fetchManifest(appUrl, slug);
    const results: InstallResult[] = [];
    const errors: Array<{ host: HostId; message: string }> = [];
    for (const host of hosts) {
      try {
        results.push(await installManifest(manifest, { host, expectedSlug: slug }));
      } catch (error) {
        errors.push({ host, message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (results.length === 0) throw new HttpError(500, errors[0]?.message ?? "Install failed.");
    for (const result of results) await reportResult(result.installed, "INSTALLED", appUrl);
    sendJson(response, 200, { results, errors });
    return;
  }

  if (method === "POST" && path === "/api/update") {
    const body = await readJson(request);
    const slug = optionalString(body, "slug");
    const all = body.all === true;
    if (body.all !== undefined && typeof body.all !== "boolean") {
      throw new HttpError(400, '"all" must be a boolean.');
    }
    if (!slug && !all) throw new HttpError(400, 'Provide "slug" or "all": true.');

    const appUrl = optionalString(body, "appUrl") ?? configuredAppUrl;
    const installations = (await listInstalled()).filter(
      (installation) => !slug || installation.skillSlug === slug,
    );
    if (installations.length === 0) throw new HttpError(404, "No matching installation found.");

    const manifests = new Map<string, Awaited<ReturnType<typeof fetchManifest>>>();
    for (const target of installations) {
      if (!manifests.has(target.skillSlug)) {
        manifests.set(target.skillSlug, await fetchManifest(appUrl, target.skillSlug));
      }
    }

    const results: InstallResult[] = [];
    const errors: Array<{ slug: string; host: HostId; message: string }> = [];
    for (const target of installations) {
      const manifest = manifests.get(target.skillSlug);
      if (!manifest) continue;
      try {
        results.push(
          await installManifest(manifest, {
            host: target.host,
            rootOverride: dirname(target.installPath),
            expectedSlug: target.skillSlug,
          }),
        );
      } catch (error) {
        errors.push({
          slug: target.skillSlug,
          host: target.host,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (results.length === 0) throw new HttpError(500, errors[0]?.message ?? "Update failed.");
    for (const result of results) await reportResult(result.installed, "INSTALLED", appUrl);
    sendJson(response, 200, { results, errors });
    return;
  }

  if (method === "POST" && path === "/api/rollback") {
    const body = await readJson(request);
    const slug = requireString(body, "slug");
    const host = requireHost(body.host, "host");
    const result = await rollback(slug, host);
    await reportResult(result.installed, "ROLLED_BACK", configuredAppUrl);
    sendJson(response, 200, { result });
    return;
  }

  if (method === "POST" && path === "/api/remove") {
    const body = await readJson(request);
    const slug = requireString(body, "slug");
    const host = requireHost(body.host, "host");
    const result = await removeSkill(slug, host);
    await reportResult(result.installation, "REMOVED", configuredAppUrl);
    sendJson(response, 200, { result });
    return;
  }

  const knownPath = [
    "/api/health",
    "/api/agents",
    "/api/detect",
    "/api/installed",
    "/api/settings",
    "/api/install",
    "/api/update",
    "/api/updates",
    "/api/rollback",
    "/api/remove",
  ].includes(path);
  if (knownPath) {
    response.setHeader("allow", "GET, POST, OPTIONS");
    throw new HttpError(405, "Method not allowed.");
  }
  throw new HttpError(404, "Not found.");
}

export async function startServer(options: StartOptions = {}): Promise<RunningAgent> {
  const token = options.token ?? (await getOrCreateToken());
  const requestedPort = parsePort(options.port ?? process.env.PORT);
  const origins = allowedOrigins();
  const configuredAppUrl = defaultAppUrl();
  let actualPort = requestedPort;

  const server = createServer((request, response) => {
    void (async () => {
      let status = 500;
      let failure: string | undefined;
      try {
        response.setHeader("Vary", "Origin");
        requireHostHeader(request, actualPort);
        applyCors(request, response, origins);
        if (request.method === "OPTIONS") {
          status = 204;
          response.statusCode = 204;
          response.setHeader("cache-control", "no-store");
          response.end();
          return;
        }
        if (!tokenMatches(request.headers["x-agent-token"], token)) {
          status = 401;
          throw new HttpError(401, "Missing or invalid X-Agent-Token.");
        }
        const url = new URL(request.url ?? "/", `http://127.0.0.1:${actualPort}`);
        await route(request, response, url, configuredAppUrl);
        status = response.statusCode;
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        if (!response.headersSent) {
          status = error instanceof HttpError ? error.status : 500;
          sendJson(response, status, { error: failure });
        } else {
          response.destroy();
        }
      } finally {
        if (isMutation(request) || status === 401 || status === 403) {
          await appendJournal({
            op: "HTTP",
            method: request.method,
            path: request.url,
            status,
            error: failure ?? null,
          });
        }
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(requestedPort, "127.0.0.1", () => {
      server.off("error", onError);
      const address = server.address();
      if (address && typeof address === "object") actualPort = address.port;
      resolve();
    });
  });

  const url = `http://127.0.0.1:${actualPort}`;
  const state = await readState();
  configureAutoUpdate(state.autoUpdate, configuredAppUrl);
  return {
    server,
    port: actualPort,
    url,
    token,
    close: () =>
      new Promise<void>((resolve, reject) => {
        stopAutoUpdate();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections?.();
      }),
  };
}

export function formatPairing(running: Pick<RunningAgent, "url" | "token">): string {
  return [
    `Skills Hub local companion: ${running.url}`,
    `Pairing token: ${running.token}`,
    `Token file: ${tokenPath()}`,
    "Open the web app and paste the token when prompted.",
  ].join("\n");
}

const directEntry =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (directEntry) {
  startServer()
    .then((running) => {
      console.log(formatPairing(running));
    })
    .catch((error) => {
      console.error(`Could not start the Skills Hub agent: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
