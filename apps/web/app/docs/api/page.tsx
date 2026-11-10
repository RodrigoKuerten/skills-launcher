export const metadata = { title: "Public API" };

const endpoints: Array<[string, string, string, string]> = [
  ["GET", "/api/v1/skills?q=&category=&host=&trust=&sort=&page=", "Paginated active catalog", "none"],
  ["GET", "/api/v1/skills/:slug", "Skill detail, version, compatibility, reviews", "none"],
  ["GET", "/api/v1/skills/:slug/manifest", "Integrity manifest consumed by the companion", "none · no-store"],
  ["GET", "/api/v1/skills/:slug/download", "ZIP export for permissively licensed skills", "none · license-gated"],
  ["GET", "/api/v1/categories", "Categories with active skill counts", "none"],
  ["GET", "/api/v1/sources", "Monitored sources and last status", "none"],
  ["GET", "/api/v1/updates?limit=", "Latest published versions", "none"],
  ["GET", "/api/v1/library", "Current user's saved skills", "session"],
  ["POST", "/api/v1/library", "Toggle a saved skill ({ skillId })", "session"],
  ["GET", "/api/v1/me/tokens", "List companion API tokens", "session"],
  ["POST", "/api/v1/me/tokens", "Create a token; raw value returned once", "session"],
  ["DELETE", "/api/v1/me/tokens/:id", "Revoke a token", "session"],
  ["POST", "/api/v1/skills/:slug/reviews", "Create/update a review ({ rating, body })", "session"],
  ["POST", "/api/v1/skills/:slug/reports", "Report a skill ({ reason, details })", "session"],
  ["GET", "/api/v1/installations", "Your reported installations", "session"],
  ["POST", "/api/v1/installations", "Report an install/update from the companion", "bearer API token"],
  ["POST", "/api/cron/sync", "Enqueue and process due sources", "CRON_SECRET or admin"],
];

export default function ApiDocsPage() {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Docs / API</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Public API</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        JSON over HTTPS, no version negotiation beyond <code className="font-mono">/v1</code>. Responses are{" "}
        <code className="font-mono">no-store</code> for mutable and gated resources. Rate limits are per-IP fixed windows in
        the MVP; back with Redis before horizontal scaling.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Authentication</h2>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <li>
          <strong className="text-foreground">Session:</strong> HTTP-only <code className="font-mono">ash_session</code>{" "}
          cookie. Mutations require a same-origin <code className="font-mono">Origin</code>.
        </li>
        <li>
          <strong className="text-foreground">API token:</strong>{" "}
          <code className="font-mono">Authorization: Bearer sh_…</code> for companion reports. Tokens are stored hashed and
          scoped to installation reporting.
        </li>
        <li>
          <strong className="text-foreground">Cron:</strong> <code className="font-mono">Authorization: Bearer $CRON_SECRET</code>{" "}
          or an admin session.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Endpoints</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-[11px]">
          <thead className="bg-muted text-[9px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Path</th>
              <th className="px-3 py-2">Purpose</th>
              <th className="px-3 py-2">Auth</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {endpoints.map(([method, path, purpose, auth]) => (
              <tr key={method + path}>
                <td className="px-3 py-2 font-mono text-[9px] text-accent">{method}</td>
                <td className="px-3 py-2 font-mono text-[10px]">{path}</td>
                <td className="px-3 py-2 text-muted-foreground">{purpose}</td>
                <td className="px-3 py-2 font-mono text-[9px] text-muted-foreground">{auth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Manifest contract</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-[10px] leading-relaxed">
        <code>{`{
  "slug": "tdd-workflow",
  "name": "TDD Workflow",
  "versionLabel": "2026.11.09-a31f9c2",
  "contentHash": "sha256 of canonical file set",
  "integrity": "sha256-manifest",
  "distribution": "FULL",
  "files": [
    { "path": "SKILL.md", "encoding": "utf8", "content": "...", "sha256": "..." }
  ],
  "compatibility": { "claude-code": "VERIFIED", "cursor": "VERIFIED" },
  "instructions": "fixed installation text",
  "sourceUrl": "https://github.com/owner/repo/tree/<sha>/<path>"
}`}</code>
      </pre>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Manifest checksums establish integrity relative to the server. They do not establish authenticity or safety.
        Quarantined versions and source-only licenses never produce a manifest.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Example request</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-[10px] leading-relaxed">
        <code>{`curl "http://localhost:3000/api/v1/skills?q=testing&host=opencode&sort=quality&page=1"

curl -X POST http://127.0.0.1:4780/api/install \\
  -H "content-type: application/json" \\
  -H "x-agent-token: <pairing-token>" \\
  -d '{"slug":"tdd-workflow","hosts":["opencode"],"appUrl":"http://localhost:3000"}'`}</code>
      </pre>

      <h2 className="mt-8 text-lg font-semibold">Errors</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        <code className="font-mono">{`{ "error": "..." }`}</code> with 400 (validation), 401 (missing auth), 403
        (cross-origin/role), 404 (not found/quarantined), 409 (license or state conflict), 429 (rate limit). Internal errors
        do not leak stack traces.
      </p>
    </div>
  );
}
