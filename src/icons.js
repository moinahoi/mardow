// Thin line icons (1.5px stroke) replacing Crepe's filled Material icons, so the editor matches the sidebar.
// The `thin` group sets fill/stroke itself; style.css only sets `color` on the surrounding element.
const thin = (d) => `<svg viewBox="0 0 24 24" width="24" height="24"><g class="thin" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`;
const heading = (n) => thin(`<path d="M4 6v12M12 6v12M4 12h8"/>${n}`);

const plus = thin('<path d="M12 6v12M6 12h12"/>');
const trash = thin('<path d="M4 7h16M9 7V4.5h6V7M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6"/>');
const link = thin('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
const lines = thin('<path d="M6 10h12M6 14h12"/>');
const align = (a, b) => thin(`<path d="M4 6h16M${a} 10h10M4 14h16M${b} 18h10"/>`);

export const slashIcons = {
  text: thin('<path d="M5 6h14M12 6v13M9.5 19h5"/>'),
  h1: heading('<path d="M16.5 9.5 19 8v10"/>'),
  h2: heading('<path d="M16 10a2.5 2.5 0 0 1 5 0c0 1.4-1 2.3-2.4 3.6L16 18h5"/>'),
  h3: heading('<path d="M16.5 8h4l-2.3 3.2a2.6 2.6 0 1 1-2.2 4.4"/>'),
  quote: thin('<path d="M5 5v14M9 8h10M9 12h10M9 16h6"/>'),
  divider: thin('<path d="M4 12h16"/>'),
  bulletList: thin('<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r=".6"/><circle cx="5" cy="12" r=".6"/><circle cx="5" cy="18" r=".6"/>'),
  orderedList: thin('<path d="M11 6h9M11 12h9M11 18h9"/><path d="M4 5.5 5.5 4.5V10"/><path d="M4 15a1.5 1.5 0 0 1 3 0c0 .9-3 2.4-3 4h3"/>'),
  taskList: thin('<rect x="3.5" y="4" width="6" height="6" rx="1.5"/><path d="m5 7 1.2 1.2L8.2 6"/><rect x="3.5" y="14" width="6" height="6" rx="1.5"/><path d="M13 7h7M13 17h7"/>'),
  codeBlock: thin('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
  table: thin('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10"/>'),
};

export const toolbarIcons = {
  boldIcon: thin('<path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7zM7 12h6.5a3.5 3.5 0 0 1 0 7H7z"/>'),
  italicIcon: thin('<path d="M11 5h7M6 19h7M14.5 5l-5 14"/>'),
  strikethroughIcon: thin('<path d="M5 12h14"/><path d="M15.8 7.5C15.2 6 13.8 5 12 5c-2.3 0-4 1.3-4 3.2 0 1.5 1 2.3 2.6 2.8"/><path d="M8.2 16.5C8.8 18 10.2 19 12 19c2.3 0 4-1.3 4-3.2 0-.6-.2-1.2-.5-1.6"/>'),
  codeIcon: thin('<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>'),
  linkIcon: link,
};

export const listIcons = {
  bulletIcon: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',
  checkBoxUncheckedIcon: thin('<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4"/>'),
  checkBoxCheckedIcon: thin('<rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4"/><path d="m7.8 12.2 2.9 2.9 5.5-6"/>'),
};

export const tableIcons = {
  addRowIcon: plus,
  addColIcon: plus,
  deleteRowIcon: trash,
  deleteColIcon: trash,
  alignLeftIcon: align(4, 4),
  alignCenterIcon: align(7, 7),
  alignRightIcon: align(10, 10),
  colDragHandleIcon: lines,
  rowDragHandleIcon: lines,
};

export const linkTooltipIcons = {
  linkIcon: link,
  editButton: thin('<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  removeButton: trash,
  confirmButton: thin('<path d="m5 12 4.5 4.5L19 7"/>'),
};

export const codeIcons = {
  expandIcon: thin('<path d="m6 9 6 6 6-6"/>'),
  searchIcon: thin('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>'),
  clearSearchIcon: thin('<path d="M7 7l10 10M17 7 7 17"/>'),
  copyIcon: thin('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
};
