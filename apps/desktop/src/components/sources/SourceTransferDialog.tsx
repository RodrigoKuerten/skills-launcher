import { useEffect, useMemo, useState } from "react";
import { Copy, Download, FileJson, FileUp, TriangleAlert } from "lucide-react";
import { useToast } from "../ui/Toast";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Skeleton } from "../ui/Skeleton";
import { Tabs } from "../ui/Tabs";
import { Textarea } from "../ui/Input";
import {
  copyText,
  downloadTextFile,
  errorMessage,
  formatDate,
  formatNumber,
} from "../../lib/format";
import { ipc } from "../../lib/ipc";
import type { SourceExport } from "../../lib/types";

export interface SourceTransferDialogProps {
  onClose: () => void;
  onImported: () => void;
}

export function SourceTransferDialog({ onClose, onImported }: SourceTransferDialogProps) {
  const toast = useToast();
  const [tab, setTab] = useState("export");
  const [exportData, setExportData] = useState<SourceExport | null>(null);
  const [exportLoading, setExportLoading] = useState(true);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const loadExport = async () => {
    setExportLoading(true);
    setExportError(null);
    try {
      setExportData(await ipc.exportSources());
    } catch (reason) {
      setExportError(errorMessage(reason, "Could not export sources."));
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    void loadExport();
  }, []);

  const pretty = useMemo(
    () => (exportData ? JSON.stringify(exportData, null, 2) : ""),
    [exportData],
  );

  const filename = `skills-launcher-sources-${new Date().toISOString().slice(0, 10)}.json`;

  const copy = async () => {
    if (!pretty) return;
    setCopying(true);
    try {
      await copyText(pretty);
      toast.success("Copied to clipboard", "The source export is ready to paste elsewhere.");
    } catch (reason) {
      toast.error("Could not copy", errorMessage(reason));
    } finally {
      setCopying(false);
    }
  };

  const download = () => {
    if (!pretty) return;
    downloadTextFile(filename, pretty);
    toast.info("Export started", `${filename} is ready in your downloads folder.`);
  };

  const importSources = async () => {
    if (!importText.trim()) {
      setImportError("Paste a source export JSON document first.");
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const imported = await ipc.importSources(importText.trim());
      toast.success(
        "Sources imported",
        `${formatNumber(imported.length)} ${imported.length === 1 ? "source was" : "sources were"} added to the catalog.`,
      );
      onImported();
      onClose();
    } catch (reason) {
      const message = errorMessage(reason, "Could not import sources.");
      setImportError(message);
      toast.error("Import failed", message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !importing) onClose();
      }}
      title="Import & export sources"
      description="Share the source configuration between Skills Launcher installs. Skill files and credentials are not included."
      size="lg"
      footer={
        tab === "import" ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void importSources()} loading={importing}>
              <FileUp className="size-3.5" aria-hidden="true" />
              Import sources
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      <Tabs
        tabs={[
          { id: "export", label: "Export" },
          { id: "import", label: "Import" },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === "export" ? (
        <div className="space-y-3">
          {exportLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : exportError ? (
            <div className="rounded-xl border border-danger/25 bg-danger/[0.06] p-4">
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-danger">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {exportError}
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void loadExport()}>
                Retry
              </Button>
            </div>
          ) : exportData ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface/35 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <FileJson className="size-3.5 text-brand-soft/70" aria-hidden="true" />
                  {formatNumber(exportData.sources.length)}{" "}
                  {exportData.sources.length === 1 ? "source" : "sources"} · exported{" "}
                  {formatDate(exportData.exportedAt)}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => void copy()} loading={copying}>
                    {!copying ? <Copy className="size-3.5" aria-hidden="true" /> : null}
                    Copy
                  </Button>
                  <Button variant="secondary" size="sm" onClick={download}>
                    <Download className="size-3.5" aria-hidden="true" />
                    Download
                  </Button>
                </div>
              </div>
              <pre className="max-h-[320px] overflow-auto whitespace-pre rounded-xl border border-line bg-canvas/50 p-3 font-mono text-[10px] leading-relaxed text-muted">
                {pretty}
              </pre>
              <p className="text-[10px] leading-relaxed text-muted/60">
                The export contains source names, URLs, config and trust labels. Local folder paths are
                included, so review the JSON before sharing it.
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface/35 px-3 py-2.5">
            <p className="text-[11px] font-medium text-text">Paste a source export</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
              Use the JSON produced by Export in another Skills Launcher window. There is no file read
              command in this UI, so import is paste-only.
            </p>
          </div>
          <Textarea
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setImportError(null);
            }}
            placeholder={'{\n  "format": "skills-launcher-sources",\n  "version": 1,\n  "sources": []\n}'}
            className="min-h-[260px]"
            spellCheck={false}
            aria-label="Source export JSON"
          />
          {importError ? (
            <p role="alert" className="rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[11px] leading-relaxed text-danger">
              {importError}
            </p>
          ) : null}
          <p className="text-[10px] leading-relaxed text-muted/60">
            Local folder and ZIP paths cannot be imported from JSON because filesystem grants are
            session-scoped. Remove those entries and add them with the native picker instead.
          </p>
        </div>
      )}
    </Dialog>
  );
}
