import { useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink as ExternalLinkIcon, LoaderCircle } from "lucide-react";
import { errorMessage, isHttpsUrl } from "../lib/format";
import { ipc } from "../lib/ipc";
import { cx } from "../lib/cx";
import { useToast } from "./ui/Toast";

export interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  showIcon?: boolean;
}

/** External links go through the Rust allowlist; the webview never opens them itself. */
export function ExternalLink({ href, children, className, showIcon = true }: ExternalLinkProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const safe = isHttpsUrl(href);

  if (!safe) {
    return <span className={cx("break-words", className)}>{children}</span>;
  }

  const open = async () => {
    setBusy(true);
    try {
      await ipc.openUrl(href);
    } catch (reason) {
      toast.error("Could not open link", errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      title={href}
      className={cx(
        "inline-flex max-w-full items-center gap-1 break-words text-left text-brand-soft underline-offset-2 transition-colors hover:text-brand-soft/80 hover:underline disabled:opacity-60",
        className,
      )}
      disabled={busy}
    >
      <span className="truncate">{children}</span>
      {busy ? (
        <LoaderCircle className="size-3 shrink-0 animate-spin" aria-hidden="true" />
      ) : showIcon ? (
        <ExternalLinkIcon className="size-3 shrink-0" aria-hidden="true" />
      ) : null}
    </button>
  );
}
