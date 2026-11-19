// Plain text for the clipboard: what the note shows, without Markdown syntax.
// Lists keep their numbers (or •, ☐, ☑) and stay one line per item; links become their text.
// Rich targets still get the HTML copy, and pasting back into Mardow uses that HTML too.

const leaf = (node) => (node.type.name === 'hard_break' ? '\n' : node.attrs?.alt ?? '');

// Lines of one block node. `start` overrides the first number of an ordered list (partial selections).
function lines(node, start) {
  if (node.isTextblock) return node.textBetween(0, node.content.size, '\n', leaf).split('\n');
  const type = node.type.name;
  if (type === 'ordered_list' || type === 'bullet_list') {
    let n = start ?? node.attrs.order ?? 1;
    const out = [];
    node.forEach((item) => {
      const checked = item.attrs.checked;
      const mark = checked != null ? (checked ? '☑ ' : '☐ ') : type === 'ordered_list' ? `${n++}. ` : '• ';
      const inner = [];
      item.forEach((child) => inner.push(...lines(child)));
      inner.forEach((l, i) => out.push((i ? ' '.repeat(mark.length) : mark) + l));
    });
    return out;
  }
  if (type === 'table') {
    const out = [];
    node.forEach((row) => {
      const cells = [];
      row.forEach((cell) => cells.push(cell.textContent));
      out.push(cells.join('\t'));
    });
    return out;
  }
  if (node.isLeaf) return type === 'hr' || type === 'horizontal_rule' ? ['———'] : [];
  const out = [];
  node.forEach((child) => out.push(...lines(child))); // blockquote and other wrappers: just their content
  return out;
}

// Blocks are separated by one empty line, list items and lines inside a block by none.
export function plainText(fragment, start) {
  if (fragment.firstChild?.isInline) return fragment.textBetween(0, fragment.size, '\n', leaf);
  const blocks = [];
  fragment.forEach((node, _, i) => blocks.push(lines(node, i === 0 ? start : undefined).join('\n')));
  return blocks.join('\n\n');
}

// First number of the copied part of an ordered list: a selection from item 3 on copies "3., 4., …".
export function listStart(slice, $from) {
  const depth = $from.depth - slice.openStart + 1;
  if (slice.openStart === 0 || depth < 1 || slice.content.firstChild?.type.name !== 'ordered_list') return undefined;
  const list = $from.node(depth);
  return list.type.name === 'ordered_list' ? (list.attrs.order ?? 1) + $from.index(depth) : undefined;
}
