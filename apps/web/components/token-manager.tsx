"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { CopyButton } from "@/components/actions";
import { useToast } from "@/components/toast";
import { formatDate } from "@/lib/utils";

type Token = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export function TokenManager() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [name, setName] = useState("Local companion");
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function load() {
    const response = await fetch("/api/v1/me/tokens");
    if (!response.ok) return;
    const data = (await response.json()) as { data: Token[] };
    setTokens(data.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRawToken(null);
    try {
      const response = await fetch("/api/v1/me/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as { token?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not create token");
      setRawToken(data.token ?? null);
      toast("success", "API token created", "Copy it now — it is shown once.");
      await load();
    } catch (error) {
      toast("error", "Token creation failed", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const response = await fetch(`/api/v1/me/tokens/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke token");
      setTokens((current) => current.filter((token) => token.id !== id));
      toast("success", "Token revoked");
    } catch (error) {
      toast("error", "Revoke failed", error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">Companion API tokens</h2>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Used by the local companion to report installations and enable update detection. Stored hashed; the raw value is
        shown once.
      </p>

      <form onSubmit={create} className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="token-name">Token name</Label>
          <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
        </div>
        <Button type="submit" size="md" disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Create
        </Button>
      </form>

      {rawToken ? (
        <div className="mt-3 rounded-lg border border-accent/25 bg-accent-soft/40 p-3">
          <p className="text-[10px] font-medium text-accent">Copy this token now — it will not be shown again.</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded border border-border bg-card px-2 py-1.5 font-mono text-[10px]">
              {rawToken}
            </code>
            <CopyButton value={rawToken} />
          </div>
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-border">
        {tokens.length ? (
          tokens.map((token) => (
            <div key={token.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{token.name}</p>
                <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                  created {formatDate(token.createdAt)} · last used {token.lastUsedAt ? formatDate(token.lastUsedAt) : "never"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(token.id)}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                aria-label={`Revoke ${token.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        ) : (
          <p className="py-3 text-[11px] text-muted-foreground">No tokens yet.</p>
        )}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Sending this token to a third party grants write access to your installation reports only, not your account.
      </p>
    </Card>
  );
}
