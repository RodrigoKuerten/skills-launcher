import { useMemo, type ReactNode } from "react";
import { cx } from "../lib/cx";

interface SafeMarkdownProps {
  source: string;
  className?: string;
  maxChars?: number;
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-text/[0.06] px-1 py-0.5 font-mono text-[11px] text-brand-soft">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function isBlockStart(line: string): boolean {
  return (
    /^(#{1,4})\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^```/.test(line) ||
    /^\s*\|.*\|\s*$/.test(line) ||
    /^\s*(---+|\*\*\*+|___+)\s*$/.test(line)
  );
}

function stripFrontmatter(source: string): string {
  if (!source.startsWith("---")) return source;
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source);
  return match ? source.slice(match[0].length) : source;
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

/**
 * Minimal, React-only markdown reader. Raw HTML never leaves the text node,
 * and links stay inert instead of launching arbitrary schemes.
 */
export function SafeMarkdown({ source, className, maxChars = 160_000 }: SafeMarkdownProps) {
  const truncated = source.length > maxChars;
  const text = truncated ? stripFrontmatter(source).slice(0, maxChars) : stripFrontmatter(source);

  const blocks = useMemo(() => {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const output: ReactNode[] = [];
    let index = 0;
    let key = 0;

    while (index < lines.length) {
      const line = lines[index] ?? "";

      if (line.trim() === "") {
        index += 1;
        continue;
      }

      if (line.trim().startsWith("|") && isTableSeparator(lines[index + 1] ?? "")) {
        const headers = tableCells(line);
        const rows: string[][] = [];
        index += 2;
        while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
          rows.push(tableCells(lines[index] ?? ""));
          index += 1;
        }
        output.push(
          <div key={key++} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-left text-[10.5px]">
              <thead className="bg-elevated/55 text-muted">
                <tr>
                  {headers.map((header, column) => (
                    <th key={column} className="border-b border-line px-2.5 py-2 font-medium">
                      {inline(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-line/60 last:border-b-0">
                    {headers.map((_, column) => (
                      <td key={column} className="px-2.5 py-2 align-top text-muted">
                        {inline(row[column] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      if (line.startsWith("```")) {
        const code: string[] = [];
        index += 1;
        while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
          code.push(lines[index] ?? "");
          index += 1;
        }
        index += 1;
        output.push(
          <pre
            key={key++}
            className="overflow-x-auto rounded-lg border border-line bg-canvas/55 p-3 font-mono text-[10.5px] leading-relaxed text-text/85"
          >
            <code>{code.join("\n")}</code>
          </pre>,
        );
        continue;
      }

      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        const level = heading[1]?.length ?? 1;
        const content = heading[2] ?? "";
        output.push(
          <h3
            key={key++}
            className={cx(
              "font-semibold tracking-[-0.01em] text-text",
              level <= 2 ? "mt-5 text-[13px]" : "mt-4 text-xs",
            )}
          >
            {inline(content)}
          </h3>,
        );
        index += 1;
        continue;
      }

      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
        output.push(<hr key={key++} className="my-4 border-line" />);
        index += 1;
        continue;
      }

      if (/^\s*[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? "")) {
          items.push((lines[index] ?? "").replace(/^\s*[-*]\s+/, ""));
          index += 1;
        }
        output.push(
          <ul key={key++} className="ml-4 list-disc space-y-1 text-[11.5px] leading-relaxed text-muted marker:text-brand-soft/70">
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item)}</li>
            ))}
          </ul>,
        );
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index] ?? "")) {
          items.push((lines[index] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
          index += 1;
        }
        output.push(
          <ol key={key++} className="ml-4 list-decimal space-y-1 text-[11.5px] leading-relaxed text-muted marker:text-brand-soft/70">
            {items.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item)}</li>
            ))}
          </ol>,
        );
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        const quote: string[] = [];
        while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? "")) {
          quote.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
          index += 1;
        }
        output.push(
          <blockquote
            key={key++}
            className="border-l-2 border-brand/35 pl-3 text-[11.5px] italic leading-relaxed text-muted"
          >
            {inline(quote.join(" "))}
          </blockquote>,
        );
        continue;
      }

      const paragraph: string[] = [];
      while (
        index < lines.length &&
        (lines[index] ?? "").trim() !== "" &&
        !isBlockStart(lines[index] ?? "")
      ) {
        paragraph.push(lines[index] ?? "");
        index += 1;
      }
      output.push(
        <p key={key++} className="text-[11.5px] leading-relaxed text-muted">
          {inline(paragraph.join(" "))}
        </p>,
      );
    }

    return output;
  }, [text]);

  if (!text.trim()) {
    return <p className={cx("text-xs text-muted/70", className)}>No README was captured for this source.</p>;
  }

  return (
    <div className={cx("space-y-2.5", className)}>
      {blocks}
      {truncated ? (
        <p className="border-t border-line pt-2 text-[10px] text-muted/60">
          README preview truncated at {maxChars.toLocaleString()} characters.
        </p>
      ) : null}
    </div>
  );
}
