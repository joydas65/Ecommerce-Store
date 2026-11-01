// Converts merchant text for search, metadata, and rendering as text. This is
// not an HTML sanitizer: never render the result with dangerouslySetInnerHTML.
// Kept free of DOM/server APIs so browser discovery and server reads agree.
export const plainProductText = (value) => {
  if (typeof value !== 'string') return '';
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code) => {
      if (!code.startsWith('#')) return entities[code.toLowerCase()] ?? entity;
      const hexadecimal = code[1].toLowerCase() === 'x';
      const point = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
};
