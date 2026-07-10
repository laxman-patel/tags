export function keepLastWordsTogether(text: string): string {
  const finalSpace = text.lastIndexOf(" ");

  if (finalSpace === -1) return text;

  return `${text.slice(0, finalSpace)}\u00A0${text.slice(finalSpace + 1)}`;
}
