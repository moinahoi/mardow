// Mardow: `mardow` opens the desktop window, `mardow --web` only runs the local server for a browser.
// Both use the same in-process HTTP server (server.rs) and the same UI (dist/).
#[cfg(target_os = "macos")]
mod file_drop;
mod server;
mod vault;

use std::path::PathBuf;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, LogicalPosition, Manager, RunEvent, Runtime, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

fn osascript_picker() -> Option<PathBuf> {
    // Activate first, or the dialog of this background process can open behind all windows.
    let out = std::process::Command::new("osascript")
        .args(["-e", "tell current application to activate", "-e", "POSIX path of (choose folder)"])
        .output()
        .ok()?;
    let dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !dir.is_empty()).then(|| PathBuf::from(dir))
}

/// "de"/"en" as chosen in the settings; "system" or unset follows the macOS language.
fn is_german(lang: Option<&str>) -> bool {
    match lang {
        Some("de") => true,
        Some("en") => false,
        _ => sys_locale::get_locale().is_some_and(|l| l.starts_with("de")),
    }
}

/// The usual macOS menu bar, labelled in the app's language, with Settings… (⌘,) in the app menu.
fn build_menu<R: Runtime>(app: &AppHandle<R>, de: bool) -> tauri::Result<Menu<R>> {
    let l = |de_text: &'static str, en_text: &'static str| Some(if de { de_text } else { en_text });
    let sep = || PredefinedMenuItem::separator(app);
    // macOS shows name, version, icon, copyright and credits (no author field there).
    let about = AboutMetadata {
        name: Some("Mardow".into()),
        copyright: Some("© 2026 moin-ahoi".into()),
        credits: l("Erstellt von moin-ahoi – mit ♥ gemacht.", "Made with ♥ by moin-ahoi.").map(String::from),
        icon: app.default_window_icon().cloned(), // the gradient icon also in `npm run desktop`, not only in the bundle
        ..Default::default()
    };
    let settings = MenuItem::with_id(app, "settings", l("Einstellungen …", "Settings…").unwrap(), true, Some("CmdOrCtrl+,"))?;
    let updates = MenuItem::with_id(app, "updates", l("Nach Updates suchen …", "Check for Updates…").unwrap(), true, None::<&str>)?;
    let app_menu = Submenu::with_items(app, "Mardow", true, &[
        &PredefinedMenuItem::about(app, l("Über Mardow", "About Mardow"), Some(about))?,
        &updates,
        &sep()?,
        &settings,
        &sep()?,
        &PredefinedMenuItem::services(app, l("Dienste", "Services"))?,
        &sep()?,
        &PredefinedMenuItem::hide(app, l("Mardow ausblenden", "Hide Mardow"))?,
        &PredefinedMenuItem::hide_others(app, l("Andere ausblenden", "Hide Others"))?,
        &PredefinedMenuItem::show_all(app, l("Alle einblenden", "Show All"))?,
        &sep()?,
        &PredefinedMenuItem::quit(app, l("Mardow beenden", "Quit Mardow"))?,
    ])?;
    // No Undo/Redo items on purpose: as menu items they'd swallow ⌘Z before the editor's own history sees it.
    let edit_menu = Submenu::with_items(app, l("Bearbeiten", "Edit").unwrap(), true, &[
        &PredefinedMenuItem::cut(app, l("Ausschneiden", "Cut"))?,
        &PredefinedMenuItem::copy(app, l("Kopieren", "Copy"))?,
        &PredefinedMenuItem::paste(app, l("Einsetzen", "Paste"))?,
        &PredefinedMenuItem::select_all(app, l("Alles auswählen", "Select All"))?,
    ])?;
    let window_menu = Submenu::with_items(app, l("Fenster", "Window").unwrap(), true, &[
        &PredefinedMenuItem::minimize(app, l("Im Dock ablegen", "Minimize"))?,
        &PredefinedMenuItem::maximize(app, l("Zoomen", "Zoom"))?,
        &sep()?,
        &PredefinedMenuItem::fullscreen(app, l("Vollbild", "Enter Full Screen"))?,
        &sep()?,
        &PredefinedMenuItem::close_window(app, l("Fenster schließen", "Close Window"))?,
    ])?;
    Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])
}

/// A native message on the main window. `buttons` with two choices returns whether the first was picked.
async fn dialog(app: &AppHandle, text: String, buttons: MessageDialogButtons) -> bool {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut d = app.dialog().message(text).title("Mardow").buttons(buttons);
        if let Some(win) = app.get_webview_window("main") {
            d = d.parent(&win);
        }
        d.blocking_show()
    })
    .await
    .unwrap_or(false)
}

/// Looks for a newer release (latest.json of the newest GitHub release, signature checked by the plugin)
/// and offers to install it. `manual` (menu item) also reports "up to date" and errors.
async fn check_for_update(app: AppHandle, manual: bool) {
    let de = is_german(server::saved_lang().as_deref());
    let t = |de_text: String, en_text: String| if de { de_text } else { en_text };
    let ok = || MessageDialogButtons::Ok;
    let found = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    let update = match found {
        Ok(Some(update)) => update,
        Ok(None) => {
            if manual {
                let v = app.package_info().version.to_string();
                dialog(&app, t(format!("Mardow {v} ist aktuell."), format!("Mardow {v} is up to date.")), ok()).await;
            }
            return;
        }
        Err(e) => {
            eprintln!("update check failed: {e}");
            if manual {
                dialog(&app, t(format!("Die Suche nach Updates ist fehlgeschlagen:\n{e}"), format!("Checking for updates failed:\n{e}")), ok()).await;
            }
            return;
        }
    };
    let (new, old) = (&update.version, &update.current_version);
    let question = t(
        format!("Mardow {new} ist verfügbar (installiert: {old}).\nJetzt installieren? Mardow startet danach neu."),
        format!("Mardow {new} is available (installed: {old}).\nInstall now? Mardow restarts afterwards."),
    );
    let buttons = MessageDialogButtons::OkCancelCustom(t("Installieren".into(), "Install".into()), t("Später".into(), "Later".into()));
    if !dialog(&app, question, buttons).await {
        return;
    }
    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
        dialog(&app, t(format!("Das Update ist fehlgeschlagen:\n{e}"), format!("The update failed:\n{e}")), ok()).await;
        return;
    }
    // Save what's still in the editor's 400 ms debounce before the app goes away.
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval("window.mardowFlush && window.mardowFlush()");
    }
    // shortcut: eval can't await the save; 1 s covers a normal note write, raise it if large saves get cut off
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    app.restart();
}

fn main() {
    let repo_dist = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../dist"));

    if std::env::args().any(|a| a == "--web") {
        let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(4321);
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
                .await
                .unwrap_or_else(|e| panic!("cannot listen on port {port}: {e}"));
            println!("Mardow läuft auf http://localhost:{port}");
            let (_no_files, opened) = tokio::sync::mpsc::unbounded_channel(); // the browser can't pass file paths
            server::serve(listener, repo_dist, Box::new(osascript_picker), Box::new(|_| {}), opened).await
        });
        return;
    }

    let (open_tx, opened) = tokio::sync::mpsc::unbounded_channel::<Vec<PathBuf>>();
    let drop_tx = open_tx.clone();
    let mut opened = Some(opened);
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_menu_event(|app, event| {
            if event.id() == "updates" {
                tauri::async_runtime::spawn(check_for_update(app.clone(), true));
            }
            if event.id() == "settings" {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.eval("window.mardowOpenSettings && window.mardowOpenSettings()");
                }
            }
        })
        .setup(move |app| {
            app.set_menu(build_menu(app.handle(), is_german(server::saved_lang().as_deref()))?)?;
            // Dev builds (`npm run desktop`) aren't a bundled app the updater could replace.
            if !cfg!(debug_assertions) {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await; // let the window open first
                    check_for_update(handle, false).await;
                });
            }

            // Bind before the window loads, so the first request can't race the server start.
            let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
            let port = listener.local_addr()?.port();
            listener.set_nonblocking(true)?;

            let bundled = app.path().resource_dir()?.join("dist");
            let dist = if bundled.join("index.html").exists() { bundled } else { repo_dist };

            let handle = app.handle().clone();
            let pick: server::Picker = Box::new(move || {
                let mut dialog = handle.dialog().file();
                if let Some(win) = handle.get_webview_window("main") {
                    dialog = dialog.set_parent(&win); // sheet on the window, can't hide behind it
                }
                dialog.blocking_pick_folder()?.into_path().ok()
            });
            let menu_handle = app.handle().clone();
            let on_prefs: server::OnPrefs = Box::new(move |prefs| {
                let de = is_german(prefs.get("lang").and_then(|v| v.as_str()));
                let app = menu_handle.clone();
                let _ = menu_handle.run_on_main_thread(move || {
                    if let Ok(menu) = build_menu(&app, de) {
                        let _ = app.set_menu(menu);
                    }
                });
            });
            let opened = opened.take().expect("setup runs once");
            tauri::async_runtime::spawn(async move {
                let listener = tokio::net::TcpListener::from_std(listener).expect("listener");
                server::serve(listener, dist, pick, on_prefs, opened).await
            });

            let url = format!("http://127.0.0.1:{port}/?desktop").parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Mardow")
                .inner_size(1100.0, 720.0)
                .min_inner_size(640.0, 400.0)
                .title_bar_style(TitleBarStyle::Overlay)
                .hidden_title(true)
                // Tauri's file-drop handler claims every native drag, so the page never got
                // dragover/drop and moving blocks by their handle did nothing. We don't take file drops.
                .disable_drag_drop_handler()
                .traffic_light_position(LogicalPosition::new(18.0, 24.0))
                // The webview (and its class) only exists once the window really opened, after setup returns.
                // The window only ever shows Mardow. Without this, a file dropped before the page has answered
                // WebKit's drag query (the very first drop) loads that file in place of the app.
                .on_navigation(move |url| url.host_str() == Some("127.0.0.1") && url.port() == Some(port))
                .on_page_load(move |win, _| {
                    #[cfg(target_os = "macos")]
                    {
                        let tx = drop_tx.clone();
                        let _ = win.with_webview(move |webview| {
                            file_drop::install(webview.inner().cast(), move |paths| {
                                let _ = tx.send(paths);
                            });
                        });
                    }
                })
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Mardow");
    app.run(move |_, event| {
        // Finder "Open With", double click (when Mardow is the default) or a drop on the Dock icon.
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = event {
            let _ = open_tx.send(urls.iter().filter_map(|u| u.to_file_path().ok()).collect());
        }
    });
}
