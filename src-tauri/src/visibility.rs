use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{Emitter, Manager, State, WebviewWindow};
use windows_sys::Win32::Foundation::{HWND, RECT};
use windows_sys::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows_sys::Win32::Graphics::Gdi::{
    CombineRgn, CreateRectRgn, DeleteObject, NULLREGION, RGN_DIFF,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetLayeredWindowAttributes, GetWindow, GetWindowLongW, IsIconic, IsWindowVisible, GWL_EXSTYLE,
    GW_HWNDPREV, LWA_ALPHA, LWA_COLORKEY, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT,
};

pub const EVENT: &str = "window://visible";
const EVERY: Duration = Duration::from_secs(1);

pub struct Shown(AtomicBool);

impl Default for Shown {
    fn default() -> Self {
        Self(AtomicBool::new(true))
    }
}

fn bounds(hwnd: HWND) -> Option<RECT> {
    let mut r = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as _,
            (&mut r as *mut RECT).cast(),
            size_of::<RECT>() as u32,
        )
    } == 0;
    (ok && r.right > r.left && r.bottom > r.top).then_some(r)
}

fn cloaked(hwnd: HWND) -> bool {
    let mut c: u32 = 0;
    let ok =
        unsafe { DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED as _, (&mut c as *mut u32).cast(), 4) }
            == 0;
    ok && c != 0
}

fn opaque(hwnd: HWND) -> bool {
    let ex = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
    if ex & (WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) != 0 {
        return false;
    }
    if ex & WS_EX_LAYERED == 0 {
        return true;
    }
    let (mut key, mut alpha, mut flags) = (0, 0u8, 0);
    if unsafe { GetLayeredWindowAttributes(hwnd, &mut key, &mut alpha, &mut flags) } == 0 {
        return false;
    }
    flags & LWA_COLORKEY == 0 && (flags & LWA_ALPHA == 0 || alpha == 255)
}

fn shows(hwnd: HWND) -> bool {
    unsafe { IsWindowVisible(hwnd) != 0 && IsIconic(hwnd) == 0 && !cloaked(hwnd) }
}

pub fn on_screen(hwnd: HWND) -> bool {
    if !shows(hwnd) {
        return false;
    }
    let Some(r) = bounds(hwnd) else {
        return false;
    };
    unsafe {
        let rest = CreateRectRgn(r.left, r.top, r.right, r.bottom);
        let mut above = GetWindow(hwnd, GW_HWNDPREV);
        let mut seen = true;
        while !above.is_null() {
            if shows(above) && opaque(above) {
                if let Some(o) = bounds(above) {
                    let other = CreateRectRgn(o.left, o.top, o.right, o.bottom);
                    let kind = CombineRgn(rest, rest, other, RGN_DIFF);
                    DeleteObject(other);
                    if kind == NULLREGION {
                        seen = false;
                        break;
                    }
                }
            }
            above = GetWindow(above, GW_HWNDPREV);
        }
        DeleteObject(rest);
        seen
    }
}

pub fn start(window: WebviewWindow) {
    std::thread::spawn(move || {
        let mut last = None;
        loop {
            let shown = window
                .hwnd()
                .map(|h| on_screen(h.0 as HWND))
                .unwrap_or(true);
            if last != Some(shown) {
                last = Some(shown);
                window.state::<Shown>().0.store(shown, Ordering::Relaxed);
                let _ = window.emit(EVENT, shown);
            }
            std::thread::sleep(EVERY);
        }
    });
}

#[tauri::command]
pub fn window_visible(shown: State<'_, Shown>) -> bool {
    shown.0.load(Ordering::Relaxed)
}
