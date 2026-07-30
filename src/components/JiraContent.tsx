import { Fragment, type ReactNode, useMemo } from "react";
import { detectReadableContentFormat, readableContentText, type ReadableContentFormat } from "../utils/richContent";

type JiraContentFormat = ReadableContentFormat;

export function safeJiraContentUrl(value: string) {
  try {
    const url = new URL(value, "https://local.invalid");
    return ["http:", "https:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

function attachmentLabel(value: string) {
  return value.split(/[\\/]/).pop()?.split(/[?#]/, 1)[0] || "attachment";
}

function htmlNode(node: ChildNode, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as HTMLElement;
  const children = Array.from(element.childNodes).map((child, index) => htmlNode(child, `${key}-${index}`));
  switch (element.tagName.toLowerCase()) {
    case "p": return <p key={key}>{children}</p>;
    case "br": return <br key={key} />;
    case "ul": return <ul key={key}>{children}</ul>;
    case "ol": return <ol key={key}>{children}</ol>;
    case "li": return <li key={key}>{children}</li>;
    case "strong": case "b": return <strong key={key}>{children}</strong>;
    case "em": case "i": return <em key={key}>{children}</em>;
    case "code": return <code key={key}>{children}</code>;
    case "pre": return <pre key={key}>{children}</pre>;
    case "h1": return <h3 key={key}>{children}</h3>;
    case "h2": case "h3": case "h4": return <h4 key={key}>{children}</h4>;
    case "a": {
      const href = safeJiraContentUrl(element.getAttribute("href") ?? "");
      return href ? <a key={key} href={href} target="_blank" rel="noreferrer">{children}</a> : <span key={key}>{children}</span>;
    }
    case "img": {
      const source = element.getAttribute("src") ?? "";
      const label = element.getAttribute("alt") || attachmentLabel(source);
      return <span key={key} className="jira-attachment-placeholder">Attachment image: {label}</span>;
    }
    case "iframe": case "script": case "style": case "object": case "embed": return null;
    default: return <Fragment key={key}>{children}</Fragment>;
  }
}

export function parseJiraWikiInline(content: string, keyPrefix = "wiki"): ReactNode[] {
  const pattern = /(\{\{[^}\r\n]+\}\}|\[~[^\]\r\n]+\]|\[\^[^\]\r\n]+\]|![^!\r\n]+!|\*[^*\r\n]+\*|\[[^|\]\r\n]+\|[^\]\r\n]+\]|\\\\)/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    if (match.index > cursor) result.push(content.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token === "\\\\") result.push(<br key={key} />);
    else if (token.startsWith("{{")) result.push(<code key={key}>{token.slice(2, -2)}</code>);
    else if (token.startsWith("[~")) result.push(<span key={key} className="jira-mention">@{token.slice(2, -1)}</span>);
    else if (token.startsWith("[^")) result.push(<span key={key} className="jira-attachment-placeholder">Attachment: {token.slice(2, -1)}</span>);
    else if (token.startsWith("!")) {
      const fileName = token.slice(1, -1).split("|", 1)[0];
      result.push(<span key={key} className="jira-attachment-placeholder">Attachment image: {fileName}</span>);
    } else if (token.startsWith("*")) result.push(<strong key={key}>{token.slice(1, -1)}</strong>);
    else if (token.startsWith("[")) {
      const [label, href = ""] = token.slice(1, -1).split("|");
      const safeHref = safeJiraContentUrl(href);
      result.push(safeHref
        ? <a key={key} href={safeHref} target="_blank" rel="noreferrer">{label}</a>
        : <span key={key}>{label}</span>);
    }
    cursor = pattern.lastIndex;
  }
  if (cursor < content.length) result.push(content.slice(cursor));
  return result;
}

function wikiLines(content: string, keyPrefix: string) {
  return content.split(/\r?\n/).map((line, index) => {
    const key = `${keyPrefix}-${index}`;
    const heading = line.match(/^h[1-6]\.\s+(.+)$/);
    if (heading) return <h4 key={key}>{parseJiraWikiInline(heading[1], key)}</h4>;
    const bullet = line.match(/^[*-]\s+(.+)$/);
    if (bullet) return <div key={key} className="jira-wiki-bullet">• {parseJiraWikiInline(bullet[1], key)}</div>;
    const quote = line.match(/^bq\.\s+(.+)$/);
    if (quote) return <blockquote key={key}>{parseJiraWikiInline(quote[1], key)}</blockquote>;
    return line ? <p key={key}>{parseJiraWikiInline(line, key)}</p> : <br key={key} />;
  });
}

function wikiBlocks(content: string) {
  return content.split(/\{code(?::[^}]*)?\}/i).map((block, index) =>
    index % 2
      ? <pre key={`code-${index}`}><code>{block.replace(/^\r?\n|\r?\n$/g, "")}</code></pre>
      : <Fragment key={`wiki-${index}`}>{wikiLines(block, `wiki-${index}`)}</Fragment>
  );
}

export function JiraContent({ content, format, formatHint, className = "" }: { content: unknown; format?: JiraContentFormat; formatHint?: string; className?: string }) {
  const rendered = useMemo(() => {
    if (!content) return null;
    const detected = detectReadableContentFormat(content, format ?? formatHint);
    const source = typeof content === "string" ? content : JSON.stringify(content);
    if (detected !== "html") {
      if (detected === "wiki") return wikiBlocks(source);
      return readableContentText(content, detected).split(/\r?\n/).map((line, index) => <p key={index}>{line || "\u00a0"}</p>);
    }
    const documentValue = new DOMParser().parseFromString(source, "text/html");
    return Array.from(documentValue.body.childNodes).map((node, index) => htmlNode(node, String(index)));
  }, [content, format, formatHint]);
  return <div className={`jira-content break-words text-sm leading-relaxed ${className}`}>{rendered}</div>;
}
