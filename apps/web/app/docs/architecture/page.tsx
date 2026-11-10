export const metadata = { title: "Architecture" };

export default function ArchitectureDocsPage() {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Docs / Architecture</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Architecture</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Full ADRs live in <code className="font-mono">docs/adr/</code>. This page is the operational summary.
      </p>

      <pre className="mt-6 overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-[10px] leading-relaxed">
        <code>{`Browser ──HTTPS──> Next.js (SSR + API) ──> Prisma ──> SQLite / Postgres
   │                      │
   │                      └── sync worker (cron/CLI) ──> GitHub API + raw + RSS
   │
   └── 127.0.0.1:4780 ──> local companion ──> allowlisted host skill dirs`}</code>
      </pre>

      <h2 className="mt-8 text-lg font-semibold">Trust boundaries</h2>
      <ol className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <li>
          <strong className="text-foreground">Source → importer.</strong> External responses are untrusted data. Size caps,
          path validation, no execution, no template interpolation into shell.
        </li>
        <li>
          <strong className="text-foreground">Importer → catalog.</strong> Canonical file-set hash, static scan, quality
          scoring, host-format validation, per-version quarantine and admin publishing.
        </li>
        <li>
          <strong className="text-foreground">Catalog → device.</strong> User-initiated. Checksum + path validation, backup,
          atomic swap, journal, rollback.
        </li>
        <li>
          <strong className="text-foreground">Companion API.</strong> Loopback bind, Host check, custom token on every
          request, origin allowlist, no arbitrary paths from the web.
        </li>
      </ol>

      <h2 className="mt-8 text-lg font-semibold">Version identity</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        A version is a two-level hash: <code className="font-mono">sha256(utf8(path) + NUL + bytes)</code> per file, then{" "}
        <code className="font-mono">sha256</code> over the concatenated per-file digests in path order. Membership is the file set
        under the directory containing <code className="font-mono">SKILL.md</code>, excluding <code className="font-mono">.git</code>,{" "}
        <code className="font-mono">node_modules</code>, lockfiles, files over 512 KB and sets over 4 MB / 80 files. Commit SHA
        and release tag are metadata, not identity. Publishing moves a pointer atomically; rejected or quarantined versions
        never become current.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Sync pipeline</h2>
      <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <li>1. Source due → enqueue <code className="font-mono">Job</code> with a dedupe key.</li>
        <li>2. One worker claims atomically with a conditional update; stale locks are reaped.</li>
        <li>3. GitHub tree SHA unchanged → no-op run recorded.</li>
        <li>4. Changed tree → fetch selected skill subtrees via raw content.</li>
        <li>5. Parse → scan → score → host validation → hash.</li>
        <li>6. New hash → immutable version; auto-publish only for eligible official sources and clean scans.</li>
        <li>7. Everything else stays quarantined for admin review. Removed skills become ARCHIVED.</li>
      </ol>

      <h2 className="mt-8 text-lg font-semibold">Scaling path</h2>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <li>• SQLite → Postgres: swap Prisma provider; implement SKIP LOCKED in the single job-claim function.</li>
        <li>• Cron → dedicated worker/BullMQ/SQS. Job idempotency keys already exist.</li>
        <li>• In-memory rate limit → Redis/Upstash at the limiter boundary.</li>
        <li>• DB file snapshots → object storage for large repositories.</li>
        <li>• Add manifest signing (Ed25519, pinned public key) if authenticity, not just integrity, is required.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Deliberate MVP cuts</h2>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <li>• No native Tauri shell: no Rust toolchain in this environment; the local HTTP contract is unchanged for a future webview.</li>
        <li>• No payments: schema fields exist, paid skills are labeled and not purchasable.</li>
        <li>• No email/push: update signals are in-app.</li>
        <li>• No scraping of sources that require auth or prohibit it; skills.sh is token-gated and disabled by default.</li>
      </ul>
    </div>
  );
}
