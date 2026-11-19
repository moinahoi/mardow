// Web addresses in plain text: where they are and what they link to. Used to turn pasted URLs into links.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

// [{ start, end, href }] for each address in `text`. Trailing punctuation ends the sentence, not the URL,
// except a ")" that closes a "(" inside the URL (Wikipedia links).
export function findUrls(text) {
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    while (/[.,;:!?)\]}]$/.test(url)) {
      if (url.endsWith(')') && url.split('(').length > url.split(')').length - 1) break;
      url = url.slice(0, -1);
    }
    if (/^www\.$/i.test(url) || /^https?:\/\/$/i.test(url)) continue;
    out.push({ start: m.index, end: m.index + url.length, href: /^www\./i.test(url) ? `https://${url}` : url });
  }
  return out;
}

// Links the browser may hand to the system: web pages and mail. The server checks the same.
export const openable = (href) => /^(https?:|mailto:)/i.test(href ?? '');
