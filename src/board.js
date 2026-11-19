// A board is a plain .md file: frontmatter "mardow: board", "## " headings are columns,
// top-level "- " items are cards, and lines indented by two spaces below a card are its details.
const MARK = /^---\r?\n(?:.*\r?\n)*?mardow:\s*board\s*\r?\n(?:.*\r?\n)*?---\r?\n/;

export const isBoard = (md) => MARK.test(md);

export function parseBoard(md) {
  const head = md.match(MARK)?.[0] ?? '---\nmardow: board\n---\n';
  const lines = md.slice(md.match(MARK)?.[0].length ?? 0).split('\n');
  const board = { head, intro: [], columns: [] };
  let col = null;
  let card = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/);
    const item = line.match(/^[-*+]\s+(.*)$/);
    if (h) {
      col = { title: h[1].trim(), cards: [] };
      board.columns.push(col);
      card = null;
    } else if (col && item) {
      card = { title: item[1].trim(), details: [] };
      col.cards.push(card);
    } else if (card && (line.startsWith('  ') || line.trim() === '')) {
      card.details.push(line.startsWith('  ') ? line.slice(2) : '');
    } else if (!col) {
      board.intro.push(line);
    } else if (line.trim()) {
      // Free text inside a column that isn't a card: keep it as a card so nothing gets lost.
      card = { title: line.trim(), details: [] };
      col.cards.push(card);
    }
  }
  for (const c of board.columns) for (const k of c.cards) k.details = k.details.join('\n').trim();
  board.intro = board.intro.join('\n').trim();
  return board;
}

export function serializeBoard(board) {
  const parts = [board.head.trimEnd(), ''];
  if (board.intro) parts.push(board.intro, '');
  for (const col of board.columns) {
    parts.push(`## ${col.title}`, '');
    for (const card of col.cards) {
      parts.push(`- ${card.title}`);
      if (card.details) parts.push(...card.details.split('\n').map((l) => (l ? `  ${l}` : '')), '');
    }
    if (col.cards.length && !col.cards.at(-1).details) parts.push('');
  }
  return parts.join('\n').replace(/\n+$/, '\n');
}

export const newBoard = (titles) => serializeBoard({ head: '---\nmardow: board\n---\n', intro: '', columns: titles.map((title) => ({ title, cards: [] })) });

// Checklist progress inside the details, e.g. [2, 5]; null when there is none.
export function progress(details) {
  const boxes = details.match(/^\s*[-*+] \[[ xX]\]/gm);
  return boxes ? [boxes.filter((b) => /\[[xX]\]/.test(b)).length, boxes.length] : null;
}
