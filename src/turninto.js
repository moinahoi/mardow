// "Turn into": change the type of the line under the block handle and keep its text.
// Every change goes through a plain paragraph: unwrap lists/quotes, then set or wrap into the target.
import { setBlockType, wrapIn, lift } from '@milkdown/kit/prose/commands';
import { liftListItem, wrapInList } from '@milkdown/kit/prose/schema-list';
import { TextSelection } from '@milkdown/kit/prose/state';

export const TYPES = ['text', 'h1', 'h2', 'h3', 'quote', 'bullet', 'ordered', 'task', 'code'];
const LISTS = ['bullet', 'ordered', 'task'];

// Type of the line holding the cursor, judged by its innermost wrapper.
export function currentType(state) {
  const { $from } = state.selection;
  for (let d = $from.depth - 1; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === 'list_item') return n.attrs.checked != null ? 'task' : $from.node(d - 1).type.name === 'ordered_list' ? 'ordered' : 'bullet';
    if (n.type.name === 'blockquote') return 'quote';
  }
  const block = $from.parent;
  if (block.type.name === 'heading') return block.attrs.level <= 3 ? `h${block.attrs.level}` : 'text';
  return block.type.name === 'code_block' ? 'code' : 'text';
}

// Puts the cursor at the end of the first text line inside the block at pos; false for tables, dividers and the like.
export function selectBlock(view, pos) {
  let node = view.state.doc.nodeAt(pos);
  let inner = pos;
  while (node && !node.isTextblock && ['list_item', 'bullet_list', 'ordered_list', 'blockquote'].includes(node.type.name)) {
    node = node.firstChild;
    inner += 1;
  }
  if (!node?.isTextblock) return false;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, inner + 1 + node.content.size)));
  return true;
}

const setChecked = (view, checked) => {
  const { $from } = view.state.selection;
  for (let d = $from.depth - 1; d > 0; d--) {
    if ($from.node(d).type.name === 'list_item') {
      return view.dispatch(view.state.tr.setNodeMarkup($from.before(d), undefined, { ...$from.node(d).attrs, checked }));
    }
  }
};

export function turnInto(view, type) {
  const run = (cmd) => cmd(view.state, view.dispatch);
  const n = view.state.schema.nodes;
  const from = currentType(view.state);
  if (from === type) return;
  // Bullet <-> checklist is the same list; only the item's checkbox changes, nesting stays.
  if (from !== 'ordered' && type !== 'ordered' && LISTS.includes(from) && LISTS.includes(type)) return setChecked(view, type === 'task' ? false : null);

  for (let i = 0; i < 10; i++) { // unwrap nested lists and quotes, innermost first
    const cur = currentType(view.state);
    const ok = LISTS.includes(cur) ? run(liftListItem(n.list_item)) : cur === 'quote' ? run(lift) : false;
    if (!ok) break;
  }
  if (/^h\d$/.test(type)) return run(setBlockType(n.heading, { level: Number(type[1]) }));
  if (type === 'code') return run(setBlockType(n.code_block));
  run(setBlockType(n.paragraph));
  if (type === 'quote') run(wrapIn(n.blockquote));
  if (LISTS.includes(type)) run(wrapInList(type === 'ordered' ? n.ordered_list : n.bullet_list));
  if (type === 'task') setChecked(view, false);
}
