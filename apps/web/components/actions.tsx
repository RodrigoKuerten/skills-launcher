"use client";

import { useRef, useState } from "react";
import { Check, Copy, Flag } from "lucide-react";
import { Button, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast("success", "Copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("error", "Clipboard unavailable", "Copy the text manually.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} className={className}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function ReportButton({ skillId, isAuthed }: { skillId: string; isAuthed: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  function open() {
    if (!isAuthed) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    dialogRef.current?.showModal();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const response = await fetch(`/api/v1/skills/${skillId}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: form.get("reason"), details: form.get("details") }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not submit report");
      toast("success", "Report submitted", "An admin will review it.");
      dialogRef.current?.close();
    } catch (error) {
      toast("error", "Report failed", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={open}>
        <Flag className="size-3.5" /> Report
      </Button>
      <dialog
        ref={dialogRef}
        aria-label="Report this skill"
        className="w-[min(94vw,460px)] rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={submit} className="p-5">
          <h2 className="text-sm font-semibold">Report this skill</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Reports are reviewed by admins. Do not include secrets or personal data.
          </p>
          <div className="mt-4">
            <Label htmlFor="report-reason">Reason</Label>
            <Select id="report-reason" name="reason" className="w-full" required>
              <option value="unsafe">Potentially unsafe instructions</option>
              <option value="malware">Malware or credential theft</option>
              <option value="broken">Broken install or files</option>
              <option value="license">License or attribution issue</option>
              <option value="spam">Spam or low quality</option>
            </Select>
          </div>
          <div className="mt-3">
            <Label htmlFor="report-details">Details</Label>
            <Textarea id="report-details" name="details" maxLength={4000} className="min-h-24" placeholder="Link, file, or behavior that concerns you…" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Submitting…" : "Submit report"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
