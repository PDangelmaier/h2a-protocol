const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "b", "i", "code", "pre", "ul", "ol", "li",
  "a", "img", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td", "span", "div", "hr",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

const DANGEROUS_PROTOCOLS = /^\s*(javascript|data|vbscript):/i;
const EVENT_HANDLER = /^on/i;

export function sanitizeHtml(dirty: string): string {
  return dirty
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag: string, attrs: string) => {
      const lower = tag.toLowerCase();

      if (!ALLOWED_TAGS.has(lower)) return "";

      const isClosing = match.startsWith("</");
      if (isClosing) return `</${lower}>`;

      const cleanAttrs = sanitizeAttributes(lower, attrs);
      return cleanAttrs ? `<${lower} ${cleanAttrs}>` : `<${lower}>`;
    })
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, "");
}

function sanitizeAttributes(tag: string, attrString: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return "";

  const parts: string[] = [];
  const attrRegex = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;

  while ((m = attrRegex.exec(attrString)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";

    if (!allowed.has(name)) continue;
    if (EVENT_HANDLER.test(name)) continue;
    if ((name === "href" || name === "src") && DANGEROUS_PROTOCOLS.test(value)) continue;

    parts.push(`${name}="${escapeAttr(value)}"`);
  }

  return parts.join(" ");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeFrameContent(content: unknown, format?: string): unknown {
  if (typeof content === "string") {
    if (format === "html") return sanitizeHtml(content);
    return content;
  }

  if (content && typeof content === "object" && "text" in content) {
    const c = content as { text: string; format?: string };
    if (c.format === "html") {
      return { ...c, text: sanitizeHtml(c.text) };
    }
  }

  return content;
}
