// Board view: columns side by side, cards dragged between them, titles edited in place.
// The model is the parsed file (board.js); every change re-serializes it and calls onChange(markdown).
import { parseBoard, serializeBoard, progress } from './board.js';

const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  notes: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>',
};

export function createBoardView(host, { t, esc, onChange, openCard, openMenu }) {
  let board = null;
  let drag = null; // { type: 'card', col, card } | { type: 'col', col }
  let editing = null; // { kind: 'card'|'col'|'new-card'|'new-col', col, card }

  const commit = () => { render(); onChange(serializeBoard(board)); };

  function cardHtml(card, ci, ki) {
    if (editing?.kind === 'card' && editing.col === ci && editing.card === ki) {
      return `<div class="card editing"><textarea class="inline" rows="1">${esc(card.title)}</textarea></div>`;
    }
    const p = progress(card.details);
    const badges = [
      card.details && `<span class="badge" title="${esc(t.details)}">${ICON.notes}</span>`,
      p && `<span class="badge ${p[0] === p[1] ? 'done' : ''}">${ICON.check}${p[0]}/${p[1]}</span>`,
    ].filter(Boolean).join('');
    return `<div class="card" draggable="true" data-col="${ci}" data-card="${ki}">
      <span class="card-title">${esc(card.title)}</span>
      <button class="icon small card-edit" data-board="edit-card" title="${esc(t.rename)}">${ICON.pencil}</button>
      ${badges ? `<div class="badges">${badges}</div>` : ''}
    </div>`;
  }

  function columnHtml(col, ci) {
    const titleEdit = editing?.kind === 'col' && editing.col === ci;
    const adding = editing?.kind === 'new-card' && editing.col === ci;
    return `<section class="column" data-col="${ci}">
      <header class="col-head" draggable="${!titleEdit}" data-col="${ci}">
        ${titleEdit
          ? `<input class="inline col-input" value="${esc(col.title)}" />`
          : `<span class="col-title" data-board="edit-col">${esc(col.title)}</span><span class="count">${col.cards.length}</span>`}
        <button class="icon small" data-board="col-menu" title="${esc(t.more)}">${ICON.more}</button>
      </header>
      <div class="cards" data-col="${ci}">${col.cards.map((c, ki) => cardHtml(c, ci, ki)).join('')}</div>
      ${adding
        ? `<div class="card editing"><textarea class="inline" rows="1" placeholder="${esc(t.cardTitle)}"></textarea></div>`
        : `<button class="add-card" data-board="add-card">${ICON.plus}<span>${esc(t.addCard)}</span></button>`}
    </section>`;
  }

  function render() {
    if (!board) return;
    const scroll = host.scrollLeft;
    const addingCol = editing?.kind === 'new-col';
    host.innerHTML = board.columns.map(columnHtml).join('') + (addingCol
      ? `<div class="column new-col"><input class="inline col-input" placeholder="${esc(t.columnTitle)}" /></div>`
      : `<button class="add-col" data-board="add-col">${ICON.plus}<span>${esc(t.addColumn)}</span></button>`);
    host.scrollLeft = scroll;
    const input = host.querySelector('.inline');
    if (input) {
      input.focus();
      input.setSelectionRange?.(input.value.length, input.value.length);
      autosize(input);
    }
  }

  const autosize = (el) => { if (el.tagName === 'TEXTAREA') { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };

  // ----- inline editing -----
  function finishEdit(save) {
    const input = host.querySelector('.inline');
    const value = input?.value.replace(/\s+/g, ' ').trim() ?? '';
    const e = editing;
    editing = null;
    if (!save || !e) return render();
    if (e.kind === 'card' && value) board.columns[e.col].cards[e.card].title = value;
    else if (e.kind === 'col' && value) board.columns[e.col].title = value;
    else if (e.kind === 'new-card' && value) {
      board.columns[e.col].cards.push({ title: value, details: '' });
      editing = { kind: 'new-card', col: e.col }; // keep adding, like Trello
    } else if (e.kind === 'new-col' && value) board.columns.push({ title: value, cards: [] });
    else return render();
    commit();
  }

  host.addEventListener('keydown', (e) => {
    if (!e.target.matches('.inline')) return;
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(false); }
  });
  host.addEventListener('input', (e) => { if (e.target.matches('.inline')) autosize(e.target); });
  host.addEventListener('focusout', (e) => {
    // Clicking another board control re-renders anyway; only commit when focus really left the input.
    if (e.target.matches('.inline') && editing) setTimeout(() => { if (editing && !host.contains(document.activeElement)) finishEdit(true); });
  });

  // ----- clicks -----
  host.addEventListener('click', (e) => {
    const el = e.target.closest('[data-board]');
    const colEl = e.target.closest('[data-col]');
    const ci = colEl ? Number(colEl.dataset.col) : null;
    if (e.target.closest('.inline')) return;
    if (editing) finishEdit(true);
    if (!el) {
      const card = e.target.closest('.card[data-card]');
      if (card) openCard(Number(card.dataset.col), Number(card.dataset.card));
      return;
    }
    e.stopPropagation();
    const cardEl = e.target.closest('.card[data-card]');
    switch (el.dataset.board) {
      case 'edit-card': editing = { kind: 'card', col: ci, card: Number(cardEl.dataset.card) }; return render();
      case 'edit-col': editing = { kind: 'col', col: ci }; return render();
      case 'add-card': editing = { kind: 'new-card', col: ci }; return render();
      case 'add-col': editing = { kind: 'new-col' }; return render();
      case 'col-menu': return openMenu(el, ci);
    }
  });

  // ----- drag & drop -----
  const clearMarks = () => host.querySelectorAll('.drop-before, .drop-after, .drop-end').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-end'));

  // Index to insert at, from the pointer position against the items' midpoints.
  const slot = (items, pos, axis) => {
    const i = items.findIndex((n) => { const r = n.getBoundingClientRect(); return axis === 'y' ? pos < r.top + r.height / 2 : pos < r.left + r.width / 2; });
    return i === -1 ? items.length : i;
  };

  host.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.card[data-card]');
    const head = e.target.closest?.('.col-head');
    if (card) drag = { type: 'card', col: Number(card.dataset.col), card: Number(card.dataset.card) };
    else if (head) drag = { type: 'col', col: Number(head.dataset.col) };
    else return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // WebKit/Firefox only start a drag with some data
    requestAnimationFrame(() => (card ?? head.parentElement).classList.add('dragging'));
  });

  function target(e) {
    if (drag?.type === 'card') {
      const list = e.target.closest('.column')?.querySelector('.cards');
      if (!list) return null;
      const cards = [...list.querySelectorAll('.card[data-card]')];
      return { col: Number(list.dataset.col), index: slot(cards, e.clientY, 'y'), cards, list };
    }
    if (drag?.type === 'col') {
      const cols = [...host.querySelectorAll('.column[data-col]')];
      return { index: slot(cols, e.clientX, 'x'), cols };
    }
    return null;
  }

  host.addEventListener('dragover', (e) => {
    const tg = target(e);
    if (!tg) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    const items = tg.cards ?? tg.cols;
    if (tg.index < items.length) items[tg.index].classList.add('drop-before');
    else if (items.length) items.at(-1).classList.add('drop-after');
    else tg.list?.classList.add('drop-end');
  });

  host.addEventListener('drop', (e) => {
    const tg = target(e);
    clearMarks();
    if (!tg) return;
    e.preventDefault();
    if (drag.type === 'card') {
      const [card] = board.columns[drag.col].cards.splice(drag.card, 1);
      const index = tg.col === drag.col && tg.index > drag.card ? tg.index - 1 : tg.index; // removal shifted the slot
      board.columns[tg.col].cards.splice(index, 0, card);
      if (tg.col === drag.col && index === drag.card) return render();
    } else {
      const [col] = board.columns.splice(drag.col, 1);
      const index = tg.index > drag.col ? tg.index - 1 : tg.index;
      board.columns.splice(index, 0, col);
      if (index === drag.col) return render();
    }
    commit();
  });

  host.addEventListener('dragend', () => { drag = null; clearMarks(); host.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging')); });

  return {
    load(md) { board = parseBoard(md); editing = null; render(); },
    clear() { board = null; editing = null; host.innerHTML = ''; },
    get active() { return board !== null; },
    markdown: () => serializeBoard(board),
    card: (ci, ki) => board.columns[ci]?.cards[ki],
    column: (ci) => board.columns[ci],
    rerender: render,
    editColumn(ci) { editing = { kind: 'col', col: ci }; render(); },
    updateCard(ci, ki, patch) { Object.assign(board.columns[ci].cards[ki], patch); commit(); },
    deleteCard(ci, ki) { board.columns[ci].cards.splice(ki, 1); commit(); },
    deleteColumn(ci) { board.columns.splice(ci, 1); commit(); },
  };
}
