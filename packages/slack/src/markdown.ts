const CODE_SPAN_OR_BLOCK = /(```[\s\S]*?```|`[^`\n]+`)/g;

function formatMarkdownSegmentForSlack(segment: string): string {
  return segment
    .replace(/^\s{0,3}#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, url: string) => {
      return `<${url}|${label.replace(/\|/g, "¦")}>`;
    })
    .replace(/\*\*([^\n*](?:[\s\S]*?[^\n*])?)\*\*/g, "*$1*")
    .replace(/__([^\n_](?:[\s\S]*?[^\n_])?)__/g, "*$1*")
    .replace(/~~([^~\n](?:[\s\S]*?[^~\n])?)~~/g, "~$1~");
}

export function formatMarkdownForSlack(text: string): string {
  if (!text) return text;

  const parts = text.split(CODE_SPAN_OR_BLOCK);
  return parts
    .map((part) => {
      if (part.startsWith("`")) return part;
      return formatMarkdownSegmentForSlack(part);
    })
    .join("");
}
