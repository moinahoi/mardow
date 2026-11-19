//! All file-system access to the notes folder ("vault").
//! Layout: <vault>/Note.md (no folder) and <vault>/<Folder>/Note.md (one level only).
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const META: &str = ".mardow.json";

#[derive(Debug)]
pub struct Error {
    pub status: u16,
    pub msg: String,
}

pub fn bad(msg: impl Into<String>) -> Error {
    Error { status: 400, msg: msg.into() }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        let status = if e.kind() == std::io::ErrorKind::NotFound { 404 } else { 500 };
        Error { status, msg: e.to_string() }
    }
}

impl From<trash::Error> for Error {
    fn from(e: trash::Error) -> Self {
        Error { status: 500, msg: e.to_string() }
    }
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Serialize, Clone, Debug)]
pub struct Note {
    pub path: String,
    pub title: String,
    pub mtime: f64,
    /// File birth time. shortcut: editors that save by replacing the file reset it; store it in .mardow.json if that matters.
    pub created: f64,
    pub pinned: bool,
    /// Listed in the "Important" section and highlighted.
    pub important: bool,
    /// Kanban board (frontmatter `mardow: board`), shown as a board instead of the text editor.
    pub board: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

/// The text after a leading `---` frontmatter block, and whether that block marks a board.
fn split_frontmatter(text: &str) -> (&str, bool) {
    let Some(rest) = text.strip_prefix("---\n") else { return (text, false) };
    let Some(end) = rest.find("\n---\n") else { return (text, false) };
    let board = rest[..end].lines().any(|l| l.split_once(':').is_some_and(|(k, v)| k.trim() == "mardow" && v.trim() == "board"));
    (&rest[end + 5..], board)
}

fn is_board(path: &Path) -> bool {
    use std::io::Read;
    let mut head = [0u8; 256];
    let n = fs::File::open(path).and_then(|mut f| f.read(&mut head)).unwrap_or(0);
    split_frontmatter(&String::from_utf8_lossy(&head[..n])).1
}

#[derive(Serialize)]
pub struct Folder {
    pub name: String,
    pub notes: Vec<Note>,
}

#[derive(Serialize)]
pub struct Tree {
    pub root: Vec<Note>,
    pub folders: Vec<Folder>,
    /// Manual sort order (note paths); notes not listed come after, newest first.
    pub order: Vec<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct Meta {
    #[serde(default)]
    pinned: Vec<String>,
    #[serde(default)]
    important: Vec<String>,
    #[serde(default)]
    order: Vec<String>,
    #[serde(flatten)]
    rest: serde_json::Map<String, serde_json::Value>, // keep fields we don't know
}

// ---------- Trust boundary: every path from the client goes through these ----------

pub fn resolve_note(vault: &Path, rel: &str) -> Result<PathBuf> {
    let parts: Vec<&str> = rel.split('/').collect();
    // No empty or dot-prefixed parts rules out "", "/abs", "..", ".hidden" and deeper nesting.
    if !rel.ends_with(".md") || parts.len() > 2 || parts.iter().any(|p| p.is_empty() || p.starts_with('.')) {
        return Err(bad(format!("invalid note path: {rel}")));
    }
    Ok(vault.join(rel))
}

pub fn resolve_folder(vault: &Path, name: &str) -> Result<PathBuf> {
    if name.is_empty() || name.contains('/') || name.starts_with('.') {
        return Err(bad(format!("invalid folder: {name}")));
    }
    Ok(vault.join(name))
}

/// Validates a vault folder chosen by the user. Relative paths resolve against home, never the
/// process cwd ("/" for apps started from Finder). The disk root is refused: it breaks every path
/// check and the watcher would watch the whole disk.
pub fn check_vault(dir: &str, home: &Path) -> Result<PathBuf> {
    let raw = dir.trim();
    if raw.is_empty() {
        return Err(bad("no folder given"));
    }
    let expanded = match raw.strip_prefix('~') {
        Some(rest) if rest.is_empty() || rest.starts_with('/') => home.join(rest.trim_start_matches('/')),
        _ => home.join(raw), // join keeps absolute paths as they are
    };
    let abs = fs::canonicalize(&expanded).map_err(|_| bad(format!("not a folder: {}", expanded.display())))?;
    if abs.parent().is_none() {
        return Err(bad(format!("choose a folder, not the disk root: {}", abs.display())));
    }
    if !abs.is_dir() {
        return Err(bad(format!("not a folder: {}", abs.display())));
    }
    Ok(abs)
}

pub fn clean_name(name: &str, fallback: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c == '/' || c == '\\' || c == ':' || c.is_control() { '-' } else { c })
        .collect();
    let s: String = s.trim_start_matches(|c: char| c == '.' || c.is_whitespace()).trim().chars().take(150).collect();
    if s.is_empty() { fallback.to_string() } else { s }
}

/// "Idee", "Idee 2", "Idee 3", ...
fn unique_name(dir: &Path, base: &str, ext: &str) -> String {
    (1..)
        .map(|i| if i == 1 { base.to_string() } else { format!("{base} {i}") })
        .find(|name| !dir.join(format!("{name}{ext}")).exists())
        .unwrap()
}

fn rel_of(folder: &str, file: &str) -> String {
    if folder.is_empty() { file.to_string() } else { format!("{folder}/{file}") }
}

fn folder_of(rel: &str) -> &str {
    rel.split_once('/').map_or("", |(f, _)| f)
}

fn file_of(rel: &str) -> &str {
    rel.rsplit('/').next().unwrap_or(rel)
}

fn read_meta(vault: &Path) -> Meta {
    fs::read_to_string(vault.join(META)).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn update_meta(vault: &Path, f: impl FnOnce(&mut Meta)) -> Result<()> {
    let mut meta = read_meta(vault);
    f(&mut meta);
    for list in [&mut meta.pinned, &mut meta.important, &mut meta.order] {
        let mut seen = std::collections::HashSet::new();
        list.retain(|p| seen.insert(p.clone()));
    }
    fs::write(vault.join(META), serde_json::to_string_pretty(&meta).unwrap())?;
    Ok(())
}

/// Applies a path change (rename, move, delete) to every list in .mardow.json.
fn update_paths(vault: &Path, f: impl Fn(&mut Vec<String>)) -> Result<()> {
    update_meta(vault, |m| {
        f(&mut m.pinned);
        f(&mut m.important);
        f(&mut m.order);
    })
}

fn replace_path(list: &mut [String], from: &str, to: &str) {
    list.iter_mut().filter(|x| *x == from).for_each(|x| *x = to.to_string());
}

// ---------- Operations ----------

fn list_notes(vault: &Path, folder: &str, flags: &Meta) -> Result<Vec<Note>> {
    let dir = if folder.is_empty() { vault.to_path_buf() } else { resolve_folder(vault, folder)? };
    let mut notes = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !entry.file_type()?.is_file() || !name.ends_with(".md") || name.starts_with('.') {
            continue;
        }
        let rel = rel_of(folder, &name);
        let meta = entry.metadata()?;
        let ms = |t: std::time::SystemTime| t.duration_since(UNIX_EPOCH).map_or(0.0, |d| d.as_millis() as f64);
        let mtime = ms(meta.modified()?);
        let created = meta.created().map_or(mtime, ms);
        notes.push(Note {
            pinned: flags.pinned.contains(&rel),
            important: flags.important.contains(&rel),
            board: is_board(&entry.path()),
            title: name[..name.len() - 3].to_string(),
            path: rel,
            mtime,
            created,
            snippet: None,
        });
    }
    Ok(notes)
}

pub fn tree(vault: &Path) -> Result<Tree> {
    let meta = read_meta(vault);
    let mut folders = Vec::new();
    for entry in fs::read_dir(vault)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.file_type()?.is_dir() && !name.starts_with('.') {
            folders.push(Folder { notes: list_notes(vault, &name, &meta)?, name });
        }
    }
    folders.sort_by_key(|f| f.name.to_lowercase());
    Ok(Tree { root: list_notes(vault, "", &meta)?, folders, order: meta.order })
}

pub fn read_note(vault: &Path, rel: &str) -> Result<String> {
    Ok(fs::read_to_string(resolve_note(vault, rel)?)?)
}

pub fn write_note(vault: &Path, rel: &str, content: &str) -> Result<()> {
    Ok(fs::write(resolve_note(vault, rel)?, content)?)
}

pub fn create_note(vault: &Path, folder: &str, title: &str) -> Result<String> {
    let dir = if folder.is_empty() { vault.to_path_buf() } else { resolve_folder(vault, folder)? };
    let name = unique_name(&dir, &clean_name(title, "Untitled"), ".md");
    let rel = rel_of(folder, &format!("{name}.md"));
    fs::OpenOptions::new().write(true).create_new(true).open(resolve_note(vault, &rel)?)?;
    Ok(rel)
}

pub fn rename_note(vault: &Path, rel: &str, title: &str) -> Result<String> {
    let from = resolve_note(vault, rel)?;
    let old_file = file_of(rel);
    let mut name = clean_name(title, "Untitled");
    if format!("{name}.md") == old_file {
        return Ok(rel.to_string());
    }
    // macOS is case-insensitive: "idee" -> "Idee" renames the same file, it's not a clash.
    if format!("{name}.md").to_lowercase() != old_file.to_lowercase() {
        name = unique_name(from.parent().unwrap(), &name, ".md");
    }
    let next = rel_of(folder_of(rel), &format!("{name}.md"));
    fs::rename(&from, resolve_note(vault, &next)?)?;
    update_paths(vault, |p| replace_path(p, rel, &next))?;
    Ok(next)
}

/// Moves a note into another folder ("" = top level), keeping its name unless that is taken there.
pub fn move_note(vault: &Path, rel: &str, folder: &str) -> Result<String> {
    let from = resolve_note(vault, rel)?;
    if folder_of(rel) == folder {
        return Ok(rel.to_string());
    }
    let dir = if folder.is_empty() { vault.to_path_buf() } else { resolve_folder(vault, folder)? };
    let title = &file_of(rel)[..file_of(rel).len() - 3];
    let next = rel_of(folder, &format!("{}.md", unique_name(&dir, title, ".md")));
    fs::rename(&from, resolve_note(vault, &next)?)?;
    update_paths(vault, |p| replace_path(p, rel, &next))?;
    Ok(next)
}

/// Saves the manual sort order; paths are only stored, so each one must be a valid note path.
pub fn set_order(vault: &Path, order: &[String]) -> Result<()> {
    for rel in order {
        resolve_note(vault, rel)?;
    }
    update_meta(vault, |m| m.order = order.to_vec())
}

pub fn delete_note(vault: &Path, rel: &str) -> Result<()> {
    trash::delete(resolve_note(vault, rel)?)?;
    update_paths(vault, |p| p.retain(|x| x != rel))
}

pub fn set_pinned(vault: &Path, rel: &str, on: bool) -> Result<()> {
    set_flag(vault, rel, on, |m| &mut m.pinned)
}

pub fn set_important(vault: &Path, rel: &str, on: bool) -> Result<()> {
    set_flag(vault, rel, on, |m| &mut m.important)
}

fn set_flag(vault: &Path, rel: &str, on: bool, list: impl FnOnce(&mut Meta) -> &mut Vec<String>) -> Result<()> {
    resolve_note(vault, rel)?;
    update_meta(vault, |m| {
        let l = list(m);
        l.retain(|x| x != rel);
        if on {
            l.push(rel.to_string());
        }
    })
}

pub fn create_folder(vault: &Path, name: &str) -> Result<String> {
    let unique = unique_name(vault, &clean_name(name, "Folder"), "");
    fs::create_dir(resolve_folder(vault, &unique)?)?;
    Ok(unique)
}

pub fn rename_folder(vault: &Path, name: &str, new_name: &str) -> Result<String> {
    let from = resolve_folder(vault, name)?;
    let mut next = clean_name(new_name, name);
    if next == name {
        return Ok(next);
    }
    if next.to_lowercase() != name.to_lowercase() {
        next = unique_name(vault, &next, "");
    }
    fs::rename(from, resolve_folder(vault, &next)?)?;
    let prefix = format!("{name}/");
    update_paths(vault, |p| {
        for x in p.iter_mut().filter(|x| x.starts_with(&prefix)) {
            *x = format!("{next}/{}", &x[prefix.len()..]);
        }
    })?;
    Ok(next)
}

pub fn delete_folder(vault: &Path, name: &str) -> Result<()> {
    trash::delete(resolve_folder(vault, name)?)?;
    let prefix = format!("{name}/");
    update_paths(vault, |p| p.retain(|x| !x.starts_with(&prefix)))
}

// shortcut: reads every file per query, fine for a few thousand notes; add an index if it gets slow.
pub fn search(vault: &Path, query: &str) -> Result<Vec<Note>> {
    let lower = |s: &str| -> Vec<char> { s.chars().map(|c| c.to_lowercase().next().unwrap_or(c)).collect() };
    let q = lower(query.trim());
    if q.is_empty() {
        return Ok(vec![]);
    }
    let t = tree(vault)?;
    let mut hits = Vec::new();
    for note in t.root.iter().chain(t.folders.iter().flat_map(|f| f.notes.iter())) {
        let full = read_note(vault, &note.path)?;
        let text: Vec<char> = split_frontmatter(&full).0.chars().collect();
        let low = lower(&text.iter().collect::<String>()); // 1:1 with `text`, so indices line up
        let pos = low.windows(q.len()).position(|w| w == q.as_slice());
        if pos.is_none() && !lower(&note.title).windows(q.len()).any(|w| w == q.as_slice()) {
            continue;
        }
        let snippet = pos.map_or(String::new(), |i| {
            let raw: String = text[i.saturating_sub(40)..(i + q.len() + 60).min(text.len())].iter().collect();
            let raw = raw.replace("<br />", "");
            let raw: String = raw.chars().filter(|c| !"#*_`>[]".contains(*c)).collect();
            raw.split_whitespace().collect::<Vec<_>>().join(" ")
        });
        hits.push(Note { snippet: Some(snippet), ..note.clone() });
    }
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notes_folders_rename_pin_search() {
        let vault = std::env::temp_dir().join(format!("mardow-test-{}", std::process::id()));
        fs::create_dir_all(&vault).unwrap();
        let vault = fs::canonicalize(&vault).unwrap();

        let folder = create_folder(&vault, "Ideen").unwrap();
        let a = create_note(&vault, &folder, "App").unwrap();
        assert_eq!(a, "Ideen/App.md");
        assert_eq!(create_note(&vault, &folder, "App").unwrap(), "Ideen/App 2.md");

        write_note(&vault, &a, "# Hallo\n\nEine Notiz über Kaffee.").unwrap();
        set_pinned(&vault, &a, true).unwrap();

        let renamed = rename_note(&vault, &a, "Mein: Projekt").unwrap();
        assert_eq!(renamed, "Ideen/Mein- Projekt.md");
        assert_eq!(rename_note(&vault, &renamed, "mein- projekt").unwrap(), "Ideen/mein- projekt.md");

        let new_folder = rename_folder(&vault, "Ideen", "Projekte").unwrap();
        let t = tree(&vault).unwrap();
        assert_eq!(t.folders.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), ["Projekte"]);
        let pinned = t.folders[0].notes.iter().find(|n| n.pinned).unwrap();
        assert_eq!(pinned.path, format!("{new_folder}/mein- projekt.md"));

        let hits = search(&vault, "KAFFEE").unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.as_deref().unwrap().contains("Kaffee"));

        // Moving keeps flags and order; a name clash in the target gets a number.
        let loose = create_note(&vault, "", "mein- projekt").unwrap();
        set_important(&vault, &loose, true).unwrap();
        set_order(&vault, &[loose.clone(), pinned.path.clone()]).unwrap();
        assert!(set_order(&vault, &["../x.md".to_string()]).is_err());
        let moved = move_note(&vault, &loose, &new_folder).unwrap();
        assert_eq!(moved, format!("{new_folder}/mein- projekt 2.md"));
        let t = tree(&vault).unwrap();
        assert_eq!(t.order, [moved.clone(), pinned.path.clone()]);
        assert!(t.folders[0].notes.iter().any(|n| n.path == moved && n.important));
        assert_eq!(move_note(&vault, &moved, "").unwrap(), "mein- projekt 2.md"); // keeps its current name

        let board = create_note(&vault, "", "Board").unwrap();
        write_note(&vault, &board, "---\nmardow: board\n---\n\n## Offen\n\n- Karte\n").unwrap();
        assert!(tree(&vault).unwrap().root.iter().any(|n| n.path == board && n.board));
        assert!(search(&vault, "mardow").unwrap().is_empty(), "frontmatter is not searchable");
        assert_eq!(search(&vault, "karte").unwrap().len(), 1);

        for bad_path in ["../x.md", "/etc/passwd.md", "a/b/c.md", ".hidden.md", "x.txt", ""] {
            assert!(resolve_note(&vault, bad_path).is_err(), "{bad_path}");
        }
        assert!(resolve_folder(&vault, "..").is_err());

        let home = std::env::temp_dir();
        assert_eq!(check_vault(vault.to_str().unwrap(), &home).unwrap(), vault);
        for bad_dir in ["", "  ", "/", "/does/not/exist"] {
            assert!(check_vault(bad_dir, &home).is_err(), "{bad_dir}");
        }
        fs::remove_dir_all(&vault).unwrap();
    }
}
