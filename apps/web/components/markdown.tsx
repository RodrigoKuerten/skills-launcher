import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders untrusted SKILL.md content. Raw HTML is never enabled; images are
 * disabled by CSS to avoid remote tracking. Links are hardened.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ?? "skill-prose"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children: linkChildren }) => {
            const safe = typeof href === "string" && /^https?:\/\//.test(href);
            if (!safe) return <span>{linkChildren}</span>;
            return (
              <a href={href} target="_blank" rel="noreferrer noopener nofollow">
                {linkChildren}
              </a>
            );
          },
          img: ({ alt, src }) =>
            typeof src === "string" && /^https?:\/\//.test(src) ? (
              <a href={src} target="_blank" rel="noreferrer noopener nofollow">
                [image: {alt || "external image"}]
              </a>
            ) : null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
