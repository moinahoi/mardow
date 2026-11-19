//! Files dragged from Finder into the window. Tauri's own drop handler would also swallow every drag
//! inside the page (sidebar, boards, block handles), so it stays off. Instead this wraps the webview's
//! `performDragOperation:`: drags from other apps hand their file paths to us, then WebKit runs as usual.
use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
use objc2::{msg_send, sel};
use std::ffi::CStr;
use std::path::PathBuf;
use std::sync::OnceLock;

type Perform = unsafe extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> Bool;
static ORIGINAL: OnceLock<Perform> = OnceLock::new();
static SINK: OnceLock<Box<dyn Fn(Vec<PathBuf>) + Send + Sync>> = OnceLock::new();

/// File paths on the drag pasteboard (Finder puts one file URL per item).
unsafe fn file_paths(info: &AnyObject) -> Vec<PathBuf> {
    let Some(url_class) = AnyClass::get(c"NSURL") else { return Vec::new() };
    let pasteboard: *mut AnyObject = msg_send![info, draggingPasteboard];
    let classes: *mut AnyObject = msg_send![AnyClass::get(c"NSArray").unwrap(), arrayWithObject: (url_class as *const AnyClass).cast::<AnyObject>()];
    let nil: *mut AnyObject = std::ptr::null_mut();
    let urls: *mut AnyObject = msg_send![pasteboard, readObjectsForClasses: classes, options: nil];
    let Some(urls) = urls.as_ref() else { return Vec::new() };
    let count: usize = msg_send![urls, count];
    (0..count)
        .filter_map(|i| {
            let url: *mut AnyObject = msg_send![urls, objectAtIndex: i];
            let is_file: Bool = msg_send![url, isFileURL];
            if !is_file.as_bool() {
                return None;
            }
            let url: *mut AnyObject = msg_send![url, filePathURL]; // Finder may hand over file reference URLs
            let path: *mut AnyObject = msg_send![url.as_ref()?, path];
            let utf8: *const std::ffi::c_char = msg_send![path.as_ref()?, UTF8String];
            (!utf8.is_null()).then(|| PathBuf::from(CStr::from_ptr(utf8).to_string_lossy().into_owned()))
        })
        .collect()
}

unsafe extern "C-unwind" fn perform(this: &AnyObject, cmd: Sel, info: &AnyObject) -> Bool {
    let source: *mut AnyObject = msg_send![info, draggingSource]; // nil for drags from other apps
    if source.is_null() {
        let paths = file_paths(info);
        if !paths.is_empty() {
            if let Some(sink) = SINK.get() {
                sink(paths);
            }
        }
    }
    ORIGINAL.get().expect("installed")(this, cmd, info)
}

/// Hooks the class of this webview (wry's WKWebView subclass; its runtime name changes with every wry version).
/// Every page load calls this; only the first call installs.
pub fn install(webview: *mut AnyObject, sink: impl Fn(Vec<PathBuf>) + Send + Sync + 'static) {
    let class = unsafe { webview.as_ref() }.map(|w| w.class());
    let Some(method) = class.and_then(|c| c.instance_method(sel!(performDragOperation:))) else {
        eprintln!("file drop: webview has no performDragOperation:");
        return;
    };
    if SINK.set(Box::new(sink)).is_err() {
        return; // already installed (every page load calls this)
    }
    unsafe {
        let ours: Imp = std::mem::transmute(perform as Perform);
        let original = method.set_implementation(ours);
        let _ = ORIGINAL.set(std::mem::transmute::<Imp, Perform>(original));
    }
}
