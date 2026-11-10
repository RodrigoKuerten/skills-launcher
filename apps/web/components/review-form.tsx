"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

export function ReviewForm({ skillId, isAuthed }: { skillId: string; isAuthed: boolean }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isAuthed) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (rating < 1) {
      toast("error", "Choose a rating first");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/v1/skills/${skillId}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, body }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not submit review");
      toast("success", "Review published");
      setBody("");
      setRating(0);
      window.location.reload();
    } catch (error) {
      toast("error", "Review failed", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Rate this skill</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Reviews come from signed-in users. They are community signals, separate from the automated scan.
      </p>
      <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value > 1 ? "s" : ""}`}
            onClick={() => setRating(value)}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            <Star className={cn("size-5", value <= rating ? "fill-accent text-accent" : "text-border")} />
          </button>
        ))}
      </div>
      <Textarea
        className="mt-3 min-h-20"
        placeholder={isAuthed ? "What worked, what broke, what should others know?" : "Sign in to review"}
        maxLength={2000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={!isAuthed}
      />
      <div className="mt-3 flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Publishing…" : isAuthed ? "Publish review" : "Sign in to review"}
        </Button>
      </div>
    </form>
  );
}
