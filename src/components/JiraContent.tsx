import { Fragment, type ReactNode, useMemo } from "react";

type JiraContentFormat = "html" | "wiki" | "plain";

function safeUrl(value: string) {
  try {
    const url = new URL(value, "https://local.invalid");
    return ["http:", "https:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
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
      const href = safeUrl(element.getAttribute("href") ?? "");
      return href ? <a key={key} href={href} target="_blank" rel="noreferrer">{children}</a> : <span key={key}>{children}</span>;
    }
    case "img": case "iframe": case "script": case "style": case "object": case "embed": return null;
    default: return <Fragment key={key}>{children}</Fragment>;
  }
}

function wikiBlocks(content: string) {
  return content.split(/\r?\n/).map((line, index) => {
    const heading = line.match(/^h[1-6]\.\s+(.+)$/);
    if (heading) return <h4 key={index}>{heading[1]}</h4>;
    const bullet = line.match(/^[*-]\s+(.+)$/);
    if (bullet) return <div key={index} className="jira-wiki-bullet">• {bullet[1]}</div>;
    const quote = line.match(/^bq\.\s+(.+)$/);
    if (quote) return <blockquote key={index}>{quote[1]}</blockquote>;
    return line ? <p key={index}>{line}</p> : <br key={index} />;
  });
}

export function JiraContent({ content, format, className = "" }: { content: string; format: JiraContentFormat; className?: string }) {
  const rendered = useMemo(() => {
    if (!content) return null;
    if (format !== "html") return format === "wiki" ? wikiBlocks(content) : content.split(/\r?\n/).map((line, index) => <p key={index}>{line || "\u00a0"}</p>);
    const documentValue = new DOMParser().parseFromString(content, "text/html");
    return Array.from(documentValue.body.childNodes).map((node, index) => htmlNode(node, String(index)));
  }, [content, format]);
  return <div className={`jira-content break-words text-sm leading-relaxed ${className}`}>{rendered}</div>;
}

