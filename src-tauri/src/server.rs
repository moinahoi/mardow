//! Local HTTP server: serves the built UI from dist/ and a small JSON API over the vault.
//! Runs inside the desktop app, or on its own with `--web`.
use crate::vault::{self, Error};
use axum::extract::{Query, Request, State};
use axum::http::{header, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use notify::Watcher;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::convert::Infallible;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::{Stream, StreamExt};

/// Opens a native folder dialog; differs between desktop (Tauri dialog) and web (AppleScript).
pub type Picker = Box<dyn Fn() -> Option<PathBuf> + Send + Sync>;
/// Called after settings change (the desktop app relabels its native menu on a language switch).
pub type OnPrefs = Box<dyn Fn(&serde_json::Map<String, Value>) + Send + Sync>;

/// `vault` is validated; every other setting (lang, theme, sort, future ones) is a plain value the UI owns.
#[derive(Serialize, Deserialize, Default, Clone)]
struct Config {
    #[serde(skip_serializing_if = "Option::is_none")]
    vault: Option<String>,
    /// Every notes folder used so far, for the switcher in the sidebar.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    vaults: Vec<String>,
    /// Last opened note per notes folder (paths differ between folders).
    #[serde(default, rename = "lastNotes", skip_serializing_if = "BTreeMap::is_empty")]
    last_notes: BTreeMap<String, String>,
    /// Single files opened from outside any notes folder (Open With, drag & drop); the only ones /api/file may touch.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    files: Vec<String>,
    #[serde(flatten)]
    prefs: serde_json::Map<String, Value>,
}

struct App {
    cfg: Mutex<Config>,
    config_path: PathBuf,
    home: PathBuf,
    dist: PathBuf,
    /// "change" (something in the vault) or "open" (a file arrived via Open With / drop).
    events: broadcast::Sender<&'static str>,
    /// The file to show once the page asks; survives a cold start where the page isn't loaded yet.
    opened: Mutex<Option<String>>,
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
    /// Watches the folders of the single files, so edits made elsewhere show up in Mardow.
    file_watcher: Mutex<Option<notify::RecommendedWatcher>>,
    /// Names of dropped/opened files that were refused, for the page to tell the user once.
    skipped: Mutex<Vec<String>>,
    pick: Picker,
    on_prefs: OnPrefs,
}

fn config_path(home: &Path) -> PathBuf {
    std::env::var("MARDOW_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home.join("Library/Application Support/Mardow/config.json"))
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
}

fn load_config(path: &Path) -> Config {
    std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// The saved UI language ("de", "en", "system" or unset), read before the server starts.
pub fn saved_lang() -> Option<String> {
    load_config(&config_path(&home())).prefs.get("lang").and_then(Value::as_str).map(String::from)
}

type St = State<Arc<App>>;
type R<T = Value> = Result<Json<T>, Error>;

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        (status, Json(json!({ "error": self.msg }))).into_response()
    }
}

impl App {
    fn vault(&self) -> vault::Result<PathBuf> {
        let cfg = self.cfg.lock().unwrap();
        cfg.vault.clone().map(PathBuf::from).ok_or(Error { status: 409, msg: "no vault selected".into() })
    }

    fn save(&self, cfg: &Config) -> vault::Result<()> {
        std::fs::create_dir_all(self.config_path.parent().unwrap())?;
        Ok(std::fs::write(&self.config_path, serde_json::to_string_pretty(cfg).unwrap())?)
    }

    fn set_vault(&self, dir: &str) -> vault::Result<()> {
        let abs = vault::check_vault(dir, &self.home)?;
        let mut cfg = self.cfg.lock().unwrap();
        let abs_str: String = abs.to_string_lossy().into();
        if !cfg.vaults.contains(&abs_str) {
            cfg.vaults.push(abs_str.clone());
        }
        cfg.vault = Some(abs_str);
        self.save(&cfg)?;
        drop(cfg);
        self.watch(&abs);
        Ok(())
    }

    /// Pushes "change" to all open windows whenever something in the vault changes, ours or external.
    fn watch(&self, dir: &Path) {
        let tx = self.events.clone();
        let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if res.is_ok() {
                let _ = tx.send("change");
            }
        })
        .and_then(|mut w| w.watch(dir, notify::RecursiveMode::Recursive).map(|_| w));
        match watcher {
            Ok(w) => *self.watcher.lock().unwrap() = Some(w),
            Err(e) => eprintln!("watch failed: {e}"),
        }
    }
}

/// Biggest single file Mardow opens; larger ones are hardly notes and would freeze the editor.
const MAX_FILE: u64 = 5 * 1024 * 1024;

impl App {
    /// Adds text files to the list and asks the page to show the last one. Folders, binaries and huge files are skipped.
    fn open_files(&self, paths: Vec<PathBuf>) {
        let mut cfg = self.cfg.lock().unwrap();
        let mut last = None;
        let mut skipped = Vec::new();
        for path in paths {
            let abs = path.canonicalize().unwrap_or(path);
            let is_text = std::fs::metadata(&abs).is_ok_and(|m| m.is_file() && m.len() <= MAX_FILE)
                && std::fs::read(&abs).is_ok_and(|b| !b.contains(&0) && std::str::from_utf8(&b).is_ok());
            if !is_text {
                skipped.push(abs.file_name().map_or_else(|| abs.to_string_lossy(), |n| n.to_string_lossy()).into_owned());
                continue;
            }
            let abs: String = abs.to_string_lossy().into();
            if !cfg.files.contains(&abs) {
                cfg.files.push(abs.clone());
            }
            last = Some(abs);
        }
        if last.is_some() {
            if let Err(e) = self.save(&cfg) {
                eprintln!("saving config failed: {}", e.msg);
            }
            let files = cfg.files.clone();
            drop(cfg);
            self.watch_files(&files);
            *self.opened.lock().unwrap() = last;
        }
        self.skipped.lock().unwrap().extend(skipped);
        let _ = self.events.send("open");
    }

    /// Watches the folder of every single file (editors often save by replacing the file, which a watch
    /// on the file itself would lose) and reports "change" only when one of the listed files is touched.
    fn watch_files(&self, files: &[String]) {
        let wanted: std::collections::HashSet<PathBuf> = files.iter().map(PathBuf::from).collect();
        let dirs: std::collections::BTreeSet<PathBuf> = wanted.iter().filter_map(|f| f.parent().map(Path::to_path_buf)).collect();
        let tx = self.events.clone();
        let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if res.is_ok_and(|e| e.paths.iter().any(|p| wanted.contains(p))) {
                let _ = tx.send("change");
            }
        });
        let watcher = watcher.map(|mut w| {
            for dir in &dirs {
                if let Err(e) = w.watch(dir, notify::RecursiveMode::NonRecursive) {
                    eprintln!("watch failed for {}: {e}", dir.display()); // e.g. folder gone; the file then fails to load anyway
                }
            }
            w
        });
        match watcher {
            Ok(w) => *self.file_watcher.lock().unwrap() = Some(w),
            Err(e) => eprintln!("file watch failed: {e}"),
        }
    }

    /// Only paths the user opened themselves (they are in `files`) may be read or written.
    fn listed_file(&self, path: &str) -> vault::Result<PathBuf> {
        if self.cfg.lock().unwrap().files.iter().any(|f| f == path) {
            Ok(PathBuf::from(path))
        } else {
            Err(Error { status: 404, msg: "file not open".into() })
        }
    }
}

/// All request fields in one place; missing ones default to empty.
#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Body {
    path: String,
    content: Option<String>,
    folder: String,
    title: String,
    name: String,
    new_name: String,
    pinned: bool,
    important: bool,
    order: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Params {
    path: String,
    q: String,
    name: String,
}

fn ok() -> R {
    Ok(Json(json!({})))
}

async fn get_config(State(s): St) -> Json<Config> {
    Json(s.cfg.lock().unwrap().clone())
}

/// Merges the given keys into the config; `null` removes a setting.
async fn put_config(State(s): St, Json(patch): Json<serde_json::Map<String, Value>>) -> R<Config> {
    for (key, value) in &patch {
        let simple = matches!(value, Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_));
        let valid_key = !key.is_empty() && key.len() <= 40 && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
        if !simple || !valid_key || ["vaults", "lastNotes", "files"].contains(&key.as_str()) {
            return Err(vault::bad(format!("invalid setting: {key}")));
        }
    }
    if let Some(v) = patch.get("vault") {
        let dir = v.as_str().ok_or_else(|| vault::bad("vault must be a string"))?;
        if Some(dir) != s.cfg.lock().unwrap().vault.as_deref() {
            s.set_vault(dir)?;
        }
    }
    let mut cfg = s.cfg.lock().unwrap();
    if let (Some(v), Some(dir)) = (patch.get("lastNote"), cfg.vault.clone()) {
        match v.as_str() {
            Some(note) => cfg.last_notes.insert(dir, note.into()),
            None => cfg.last_notes.remove(&dir),
        };
    }
    for (key, value) in patch.into_iter().filter(|(k, _)| k != "vault" && k != "lastNote") {
        if value.is_null() {
            cfg.prefs.remove(&key);
        } else {
            cfg.prefs.insert(key, value);
        }
    }
    s.save(&cfg)?;
    let cfg = cfg.clone();
    (s.on_prefs)(&cfg.prefs);
    Ok(Json(cfg))
}

// Takes a JSON body although it needs none: that forces a CORS preflight, so other sites can't trigger it.
async fn pick_vault(State(s): St, Json(_): Json<Value>) -> R<Config> {
    let app = s.clone();
    let dir = tokio::task::spawn_blocking(move || (app.pick)()).await.ok().flatten();
    if let Some(dir) = dir {
        s.set_vault(&dir.to_string_lossy())?;
    }
    Ok(Json(s.cfg.lock().unwrap().clone()))
}

/// Removes a notes folder from the switcher; the folder itself stays untouched on disk.
async fn forget_vault(State(s): St, Json(b): Json<Body>) -> R<Config> {
    let mut cfg = s.cfg.lock().unwrap();
    if cfg.vault.as_deref() == Some(b.path.as_str()) {
        return Err(vault::bad("cannot remove the open notes folder"));
    }
    cfg.vaults.retain(|v| *v != b.path);
    cfg.last_notes.remove(&b.path);
    s.save(&cfg)?;
    Ok(Json(cfg.clone()))
}

async fn read_file(State(s): St, Query(p): Query<Params>) -> R {
    let content = std::fs::read_to_string(s.listed_file(&p.path)?)?;
    Ok(Json(json!({ "content": content })))
}

async fn write_file(State(s): St, Json(b): Json<Body>) -> R {
    let content = b.content.ok_or_else(|| vault::bad("content must be a string"))?;
    std::fs::write(s.listed_file(&b.path)?, content)?;
    ok()
}

/// Same entry as Open With / drop; used by the browser mode and tests.
async fn open_file(State(s): St, Json(b): Json<Body>) -> R<Config> {
    s.open_files(vec![PathBuf::from(&b.path)]);
    Ok(Json(s.cfg.lock().unwrap().clone()))
}

/// Removes a file from the list; the file itself stays untouched.
async fn close_file(State(s): St, Json(b): Json<Body>) -> R<Config> {
    let mut cfg = s.cfg.lock().unwrap();
    cfg.files.retain(|f| *f != b.path);
    s.save(&cfg)?;
    let cfg = cfg.clone();
    s.watch_files(&cfg.files);
    Ok(Json(cfg))
}

/// The file that arrived last (once), plus the updated list.
async fn take_opened(State(s): St, Json(_): Json<Value>) -> R {
    let path = s.opened.lock().unwrap().take();
    let skipped = std::mem::take(&mut *s.skipped.lock().unwrap());
    Ok(Json(json!({ "path": path, "skipped": skipped, "config": s.cfg.lock().unwrap().clone() })))
}

/// Opens the notes folder in Finder. Only ever the vault itself, never a path from the request.
async fn reveal_vault(State(s): St, Json(_): Json<Value>) -> R {
    std::process::Command::new("open").arg(s.vault()?).spawn()?;
    ok()
}

/// Opens a link from a note (⌘-click) in the default browser or mail app. Only web and mail links,
/// so a note can never make the system open a file or an app.
async fn open_url(Json(body): Json<Value>) -> R {
    let url = body["url"].as_str().unwrap_or("");
    let lower = url.to_ascii_lowercase();
    if !["https://", "http://", "mailto:"].iter().any(|p| lower.starts_with(p)) || url.chars().any(char::is_control) {
        return Err(vault::bad("only web and mail links can be opened"));
    }
    std::process::Command::new("open").arg(url).spawn()?;
    ok()
}

async fn tree(State(s): St) -> R<vault::Tree> {
    Ok(Json(vault::tree(&s.vault()?)?))
}

async fn search(State(s): St, Query(p): Query<Params>) -> R<Vec<vault::Note>> {
    Ok(Json(vault::search(&s.vault()?, &p.q)?))
}

async fn read_note(State(s): St, Query(p): Query<Params>) -> R {
    Ok(Json(json!({ "content": vault::read_note(&s.vault()?, &p.path)? })))
}

async fn write_note(State(s): St, Json(b): Json<Body>) -> R {
    let content = b.content.ok_or_else(|| vault::bad("content must be a string"))?;
    vault::write_note(&s.vault()?, &b.path, &content)?;
    ok()
}

async fn create_note(State(s): St, Json(b): Json<Body>) -> R {
    Ok(Json(json!({ "path": vault::create_note(&s.vault()?, &b.folder, &b.title)? })))
}

async fn delete_note(State(s): St, Query(p): Query<Params>) -> R {
    vault::delete_note(&s.vault()?, &p.path)?;
    ok()
}

async fn rename_note(State(s): St, Json(b): Json<Body>) -> R {
    Ok(Json(json!({ "path": vault::rename_note(&s.vault()?, &b.path, &b.title)? })))
}

async fn pin_note(State(s): St, Json(b): Json<Body>) -> R {
    vault::set_pinned(&s.vault()?, &b.path, b.pinned)?;
    ok()
}

async fn important_note(State(s): St, Json(b): Json<Body>) -> R {
    vault::set_important(&s.vault()?, &b.path, b.important)?;
    ok()
}

async fn move_note(State(s): St, Json(b): Json<Body>) -> R {
    Ok(Json(json!({ "path": vault::move_note(&s.vault()?, &b.path, &b.folder)? })))
}

async fn set_order(State(s): St, Json(b): Json<Body>) -> R {
    vault::set_order(&s.vault()?, &b.order)?;
    ok()
}

async fn create_folder(State(s): St, Json(b): Json<Body>) -> R {
    Ok(Json(json!({ "name": vault::create_folder(&s.vault()?, &b.name)? })))
}

async fn rename_folder(State(s): St, Json(b): Json<Body>) -> R {
    Ok(Json(json!({ "name": vault::rename_folder(&s.vault()?, &b.name, &b.new_name)? })))
}

async fn delete_folder(State(s): St, Query(p): Query<Params>) -> R {
    vault::delete_folder(&s.vault()?, &p.name)?;
    ok()
}

async fn events(State(s): St) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(s.events.subscribe()).filter_map(|m| m.ok()).map(|m| Ok(Event::default().data(m)));
    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Static files from dist/, falling back to index.html.
async fn static_file(State(s): St, uri: Uri) -> Response {
    let rel = uri.path().trim_start_matches('/');
    let mut file = s.dist.join(rel);
    if rel.is_empty() || rel.split('/').any(|p| p == "..") || !file.is_file() {
        file = s.dist.join("index.html");
    }
    let mime = match file.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html",
        Some("js") => "text/javascript",
        Some("css") => "text/css",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    };
    match tokio::fs::read(&file).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, mime)], bytes).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "UI not built: run `npm run build`").into_response(),
    }
}

/// Blocks DNS rebinding: only answer requests addressed to localhost.
async fn only_localhost(req: Request, next: Next) -> Response {
    let host = req.headers().get(header::HOST).and_then(|h| h.to_str().ok()).unwrap_or("");
    let name = match host.rsplit_once(':') {
        Some((h, port)) if port.chars().all(|c| c.is_ascii_digit()) => h,
        _ => host,
    };
    if name != "localhost" && name != "127.0.0.1" {
        return StatusCode::FORBIDDEN.into_response();
    }
    next.run(req).await
}

/// `opened` delivers files from Open With and drops onto the window (desktop only).
pub async fn serve(
    listener: tokio::net::TcpListener,
    dist: PathBuf,
    pick: Picker,
    on_prefs: OnPrefs,
    mut opened: tokio::sync::mpsc::UnboundedReceiver<Vec<PathBuf>>,
) {
    let home = home();
    let config_path = config_path(&home);
    let mut cfg = load_config(&config_path);
    // A broken saved vault (e.g. "/" from older versions) falls back to the welcome screen.
    cfg.vault = cfg.vault.and_then(|v| vault::check_vault(&v, &home).ok()).map(|p| p.to_string_lossy().into());
    // Configs from before the switcher: one folder and one global last note.
    if let Some(dir) = cfg.vault.clone() {
        if !cfg.vaults.contains(&dir) {
            cfg.vaults.insert(0, dir.clone());
        }
        if let Some(Value::String(note)) = cfg.prefs.remove("lastNote") {
            cfg.last_notes.entry(dir).or_insert(note);
        }
    }

    let vault_dir = cfg.vault.clone();
    let app = Arc::new(App {
        cfg: Mutex::new(cfg),
        config_path,
        home,
        dist,
        events: broadcast::channel(16).0,
        watcher: Mutex::new(None),
        file_watcher: Mutex::new(None),
        skipped: Mutex::new(Vec::new()),
        opened: Mutex::new(None),
        pick,
        on_prefs,
    });
    if let Some(dir) = vault_dir {
        app.watch(Path::new(&dir));
    }
    let files = app.cfg.lock().unwrap().files.clone();
    app.watch_files(&files);
    let receiver = app.clone();
    tokio::spawn(async move {
        while let Some(paths) = opened.recv().await {
            receiver.open_files(paths);
        }
    });

    let router = Router::new()
        .route("/api/config", get(get_config).put(put_config))
        .route("/api/pick-vault", post(pick_vault))
        .route("/api/reveal-vault", post(reveal_vault))
        .route("/api/forget-vault", post(forget_vault))
        .route("/api/open-url", post(open_url))
        .route("/api/file", get(read_file).put(write_file))
        .route("/api/file/open", post(open_file))
        .route("/api/file/close", post(close_file))
        .route("/api/take-opened", post(take_opened))
        .route("/api/tree", get(tree))
        .route("/api/search", get(search))
        .route("/api/note", get(read_note).put(write_note).post(create_note).delete(delete_note))
        .route("/api/note/rename", post(rename_note))
        .route("/api/note/pin", post(pin_note))
        .route("/api/note/important", post(important_note))
        .route("/api/note/move", post(move_note))
        .route("/api/order", post(set_order))
        .route("/api/folder", post(create_folder).delete(delete_folder))
        .route("/api/folder/rename", post(rename_folder))
        .route("/api/events", get(events))
        .fallback(static_file)
        .layer(middleware::from_fn(only_localhost))
        .with_state(app);
    axum::serve(listener, router).await.expect("server failed");
}
