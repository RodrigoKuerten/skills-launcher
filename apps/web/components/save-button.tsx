"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

export function SaveButton({
  skillId,
  initialSaved,
  isAuthed,
  className,
}: {
  skillId: string;
  initialSaved: boolean;
  isAuthed: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function toggle() {
    if (!isAuthed) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/v1/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId }),
      });
      const data = (await response.json()) as { saved?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update library");
      setSaved(Boolean(data.saved));
      toast("success", data.saved ? "Saved to your library" : "Removed from your library");
      router.refresh();
    } catch (error) {
      toast("error", "Library update failed", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" onClick={toggle} disabled={pending} className={className}>
      {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
