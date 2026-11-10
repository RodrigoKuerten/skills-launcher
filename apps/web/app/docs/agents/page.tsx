export const metadata = { title: "Companion & install" };

export default function AgentsDocsPage() {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Docs / Install</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Companion & install</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The companion is a Node process that runs locally. It detects agent hosts, verifies manifests and writes skill
        folders. It never executes imported code.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Start and pair</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-[11px]">
        <code>{`npm run agent
# → listening on http://127.0.0.1:4780
# → pairing token: <printed once>

# or print the token later
npm run agent:cli -- pair`}</code>
      </pre>
      <p className="mt-3 text-xs text-muted-foreground">
        Paste the token into <span className="text-foreground">My Agents</span> or a skill&apos;s install panel. It is stored in
        <code className="mx-1 font-mono">sessionStorage</code> for that browser tab. Every request, including reads, must
        present it as <code className="font-mono">X-Agent-Token</code>. The server validates the Host header and only allows
        origin(s) listed in <code className="font-mono">AGENT_ALLOWED_ORIGINS</code>.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Account sync (optional)</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Create a companion API token in your profile, then start the companion with{" "}
        <code className="font-mono">SKILLS_HUB_API_TOKEN</code> set. Successful installs, updates, removals and rollbacks are
        reported to <code className="font-mono">/api/v1/installations</code>; the library and update feed then show them. Without
        the token, files still install locally and no report is sent. Reporting failures never block an install.
      </p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-[10px]">
        <code>{`# PowerShell
$env:SKILLS_HUB_API_TOKEN="sh_..."
npm run agent
# bash/zsh
SKILLS_HUB_API_TOKEN=sh_... npm run agent`}</code>
      </pre>

      <h2 className="mt-8 text-lg font-semibold">CLI</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-[11px] leading-relaxed">
        <code>{`npm run agent:cli -- detect --json
npm run agent:cli -- list
npm run agent:cli -- install <slug> --host claude-code
npm run agent:cli -- install <slug> --all
npm run agent:cli -- install <slug> --host codex --project C:\\path\\to\\project
npm run agent:cli -- updates
npm run agent:cli -- update --all
npm run agent:cli -- rollback <slug> --host claude-code
npm run agent:cli -- remove <slug> --host opencode`}</code>
      </pre>
      <p className="mt-2 text-[10px] text-muted-foreground">
        The desktop shell in <code className="font-mono">apps/desktop</code> starts the companion as a bundled sidecar,
        exposes the pairing token, detects agents and opens My Agents. Build it with <code className="font-mono">npm run
        build:desktop</code>.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Detection evidence</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        A host is reported as detected only when an executable resolves in PATH or a documented desktop install is found.
        A directory alone is not proof. Version queries run only the host&apos;s own version flag, with a timeout.
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-[11px]">
          <thead className="bg-muted text-[9px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Host</th>
              <th className="px-3 py-2">User skills directory</th>
              <th className="px-3 py-2">Project directory</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              ["Claude Code", "~/.claude/skills", ".claude/skills"],
              ["OpenAI Codex", "~/.codex/skills (also ~/.agents/skills)", ".agents/skills"],
              ["OpenCode", "~/.config/opencode/skills", ".opencode/skills"],
              ["Cursor", "~/.cursor/skills", ".cursor/skills"],
              ["Windsurf / Devin", "~/.config/devin/skills", ".devin/skills"],
              ["GitHub Copilot", "~/.copilot/skills", ".github/skills"],
              ["Gemini CLI", "~/.gemini/skills", ".gemini/skills"],
            ].map(([host, userPath, projectPath]) => (
              <tr key={host}>
                <td className="px-3 py-2 font-medium">{host}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{userPath}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{projectPath}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Paths are based on official documentation as of 2026-11-09. Windows resolves <code className="font-mono">~</code> to{" "}
        <code className="font-mono">%USERPROFILE%</code>. The companion creates the target directory only after confirmation.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Install transaction</h2>
      <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <li>1. Fetch the version manifest from the marketplace API.</li>
        <li>2. Verify the distribution is FULL and the slug/paths are safe.</li>
        <li>3. Verify every file SHA-256 and the canonical set hash.</li>
        <li>4. Resolve an allowlisted skills directory for the selected host.</li>
        <li>5. Back up any existing installation.</li>
        <li>6. Write to a temp directory and atomically swap it into place.</li>
        <li>7. Journal the operation and record the installed version/hash.</li>
      </ol>

      <h2 className="mt-8 text-lg font-semibold">Updates and rollback</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Reporting installations requires an API token from your profile, passed to the companion. Update checks compare the
        installed content hash with the latest published hash. An update backs up managed files, preserves extra local files,
        and records the previous version. Rollback restores the latest backup. Background updates are opt-in in My Agents
        (off by default); when enabled, the companion checks periodically, verifies every manifest, backs up before replacing
        and journals the result. Update signals are in-app.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Security limits</h2>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
        <li>• Checksums establish integrity, not authenticity: bytes and hashes come from the same server.</li>
        <li>• Static scanning is heuristic and can miss malicious intent.</li>
        <li>• The companion never runs skill scripts, hooks, installers or package managers.</li>
        <li>• The token is a capability, not an account password. Revoke it if leaked.</li>
      </ul>
    </div>
  );
}
