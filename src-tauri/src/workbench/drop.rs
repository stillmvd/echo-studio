use serde::Serialize;
use tauri::{Emitter, Runtime, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2File, ICoreWebView2WebMessageReceivedEventArgs2,
};
use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
use windows_core::{Interface, PWSTR};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
};
use windows_sys::Win32::System::Ole::CF_HDROP;
use windows_sys::Win32::UI::Shell::{DragQueryFileW, HDROP};

pub const EVENT: &str = "echo://dropped";
const PREFIX: &str = "echo-drop:";

#[derive(Clone, Serialize)]
struct Dropped {
    id: String,
    paths: Vec<String>,
}

pub fn listen<R: Runtime>(window: &WebviewWindow<R>) {
    let target = window.clone();
    let _ = window.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut raw = PWSTR::null();
            if args.TryGetWebMessageAsString(&mut raw).is_err() {
                return Ok(());
            }
            let text = take_pwstr(raw);
            let Some(id) = text.strip_prefix(PREFIX) else {
                return Ok(());
            };
            let paths = args
                .cast::<ICoreWebView2WebMessageReceivedEventArgs2>()
                .map(|a| dropped_paths(&a))
                .unwrap_or_default();
            let _ = target.emit(
                EVENT,
                Dropped {
                    id: id.to_owned(),
                    paths,
                },
            );
            Ok(())
        }));
        let mut token = Default::default();
        let _ = core.add_WebMessageReceived(&handler, &mut token);
    });
}

unsafe fn dropped_paths(args: &ICoreWebView2WebMessageReceivedEventArgs2) -> Vec<String> {
    let Ok(objects) = args.AdditionalObjects() else {
        return Vec::new();
    };
    let mut count = 0u32;
    if objects.Count(&mut count).is_err() {
        return Vec::new();
    }
    (0..count)
        .filter_map(|i| objects.GetValueAtIndex(i).ok())
        .filter_map(|o| o.cast::<ICoreWebView2File>().ok())
        .filter_map(|f| {
            let mut raw = PWSTR::null();
            f.Path(&mut raw).ok()?;
            Some(take_pwstr(raw)).filter(|p| !p.is_empty())
        })
        .collect()
}

pub fn clipboard_paths() -> Vec<String> {
    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP as u32) == 0 {
            return Vec::new();
        }
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Vec::new();
        }
        let handle = GetClipboardData(CF_HDROP as u32);
        let paths = if handle.is_null() {
            Vec::new()
        } else {
            hdrop_paths(handle as HDROP)
        };
        CloseClipboard();
        paths
    }
}

unsafe fn hdrop_paths(drop: HDROP) -> Vec<String> {
    let count = DragQueryFileW(drop, u32::MAX, std::ptr::null_mut(), 0);
    (0..count)
        .filter_map(|i| {
            let len = DragQueryFileW(drop, i, std::ptr::null_mut(), 0);
            let mut buf = vec![0u16; len as usize + 1];
            let got = DragQueryFileW(drop, i, buf.as_mut_ptr(), buf.len() as u32);
            (got > 0).then(|| String::from_utf16_lossy(&buf[..got as usize]))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clipboard_without_files_is_empty_or_paths() {
        for p in clipboard_paths() {
            assert!(!p.is_empty());
        }
    }
}
