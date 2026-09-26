use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use tauri::WebviewWindow;

pub struct Splash {
    ready: Arc<AtomicBool>,
    window: Arc<OnceLock<WebviewWindow>>,
}

impl Splash {
    pub fn attach(&self, window: WebviewWindow) {
        let _ = self.window.set(window);
    }

    pub fn ready(&self) {
        self.ready.store(true, Ordering::Relaxed);
    }
}

pub fn show_main(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn show(identifier: &str) -> Option<Splash> {
    if imp::already_running(identifier) {
        return None;
    }
    let ready = Arc::new(AtomicBool::new(false));
    let window: Arc<OnceLock<WebviewWindow>> = Arc::new(OnceLock::new());
    let (r, w, id) = (ready.clone(), window.clone(), identifier.to_string());
    std::thread::spawn(move || {
        imp::run(&id, &r, &|| {
            if let Some(window) = w.get() {
                show_main(window);
            }
        })
    });
    Some(Splash { ready, window })
}

mod mark {
    const UNIT: f64 = 1.0 / 64.0;
    pub const CENTER: (f64, f64) = (17.8021 * UNIT, 32.0 * UNIT);
    pub const DOT: f64 = 7.0533 * UNIT;
    pub const NEAR: f64 = 18.7147 * UNIT;
    pub const NEAR_HALF: f64 = 7.0533 / 2.0 * UNIT;
    pub const NEAR_SPAN: f64 = 50.0;
    pub const OUTER: f64 = 32.9153 * UNIT;
    pub const OUTER_HALF: f64 = 5.0784 / 2.0 * UNIT;
    pub const OUTER_SPAN: f64 = 48.0;
    pub const DASHES: [(f64, f64); 3] = [(-48.0, -25.3333), (-11.3333, 11.3333), (25.3333, 48.0)];
    pub const TRAVEL: f64 = 4.0 * UNIT;
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

fn ease_out(x: f64) -> f64 {
    1.0 - (1.0 - clamp01(x)).powi(3)
}

fn back_out(x: f64) -> f64 {
    let x = clamp01(x);
    let c = 1.9;
    1.0 + (c + 1.0) * (x - 1.0).powi(3) + c * (x - 1.0).powi(2)
}

pub const DRAW: f64 = 1.05;

struct Arc2 {
    radius: f64,
    half: f64,
    from: f64,
    to: f64,
    alpha: f64,
}

fn arc_distance(px: f64, py: f64, a: &Arc2) -> f64 {
    let (cx, cy) = mark::CENTER;
    let (dx, dy) = (px - cx, py - cy);
    let theta = dy.atan2(dx).to_degrees();
    if theta >= a.from && theta <= a.to {
        return ((dx * dx + dy * dy).sqrt() - a.radius).abs() - a.half;
    }
    let cap = |deg: f64| {
        let r = deg.to_radians();
        let (ex, ey) = (cx + a.radius * r.cos(), cy + a.radius * r.sin());
        ((px - ex).powi(2) + (py - ey).powi(2)).sqrt()
    };
    cap(a.from).min(cap(a.to)) - a.half
}

fn swept(radius: f64, half: f64, from: f64, to: f64, span: f64, p: f64) -> Option<Arc2> {
    let e = ease_out(p);
    if e <= 0.0 {
        return None;
    }
    let reach = e * span;
    let (from, to) = (from.max(-reach), to.min(reach));
    (from <= to).then_some(Arc2 {
        radius: radius - (1.0 - e) * mark::TRAVEL,
        half,
        from,
        to,
        alpha: e,
    })
}

pub fn render(buf: &mut [u8], size: usize, t: f64, glow: f64) {
    let dot_p = t / 0.34;
    let dot_r = mark::DOT * back_out(dot_p);
    let dot_a = ease_out(dot_p * 1.4);
    let mut arcs = Vec::with_capacity(4);
    arcs.extend(swept(
        mark::NEAR,
        mark::NEAR_HALF,
        -mark::NEAR_SPAN,
        mark::NEAR_SPAN,
        mark::NEAR_SPAN,
        (t - 0.24) / 0.42,
    ));
    for (from, to) in mark::DASHES {
        if let Some(mut a) = swept(
            mark::OUTER,
            mark::OUTER_HALF,
            from,
            to,
            mark::OUTER_SPAN,
            (t - 0.52) / 0.53,
        ) {
            a.alpha *= glow;
            arcs.push(a);
        }
    }
    let px = 1.0 / size as f64;
    let (cx, cy) = mark::CENTER;
    for y in 0..size {
        for x in 0..size {
            let (fx, fy) = ((x as f64 + 0.5) * px, (y as f64 + 0.5) * px);
            let mut cov = 0.0f64;
            if dot_r > 0.0 {
                let d = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt() - dot_r;
                cov = cov.max(clamp01(0.5 - d / px) * dot_a);
            }
            for a in &arcs {
                let d = arc_distance(fx, fy, a);
                cov = cov.max(clamp01(0.5 - d / px) * a.alpha);
            }
            let i = (y * size + x) * 4;
            let a = cov;
            buf[i] = (76.0 * a).round() as u8;
            buf[i + 1] = (162.0 * a).round() as u8;
            buf[i + 2] = (255.0 * a).round() as u8;
            buf[i + 3] = (255.0 * a).round() as u8;
        }
    }
}

#[cfg(windows)]
mod imp {
    use std::mem::{size_of, zeroed};
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::{Duration, Instant};

    use windows_sys::Win32::Foundation::{POINT, SIZE};
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetMonitorInfoW,
        MonitorFromPoint, SelectObject, AC_SRC_ALPHA, AC_SRC_OVER, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::HiDpi::{
        GetDpiForMonitor, SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        MDT_EFFECTIVE_DPI,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, FindWindowW,
        PeekMessageW, RegisterClassW, ShowWindow, TranslateMessage, UpdateLayeredWindow, MSG,
        PM_REMOVE, SW_SHOWNOACTIVATE, ULW_ALPHA, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
    };

    use super::{render, DRAW};

    const LOGICAL: f64 = 128.0;
    const FADE_OUT: f64 = 0.24;
    const BREATH: f64 = 1.6;
    const TIMEOUT: f64 = 8.0;

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    fn class_name(identifier: &str) -> Vec<u16> {
        wide(&format!("{identifier}-splash"))
    }

    pub fn already_running(identifier: &str) -> bool {
        let class = class_name(identifier);
        unsafe { !FindWindowW(class.as_ptr(), null()).is_null() }
    }

    unsafe fn primary_monitor() -> ((i32, i32), f64) {
        SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let monitor = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
        let mut info: MONITORINFO = zeroed();
        info.cbSize = size_of::<MONITORINFO>() as u32;
        GetMonitorInfoW(monitor, &mut info);
        let (mut dpi, mut dpi_y) = (96, 96);
        GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi, &mut dpi_y);
        let work = info.rcWork;
        (
            ((work.left + work.right) / 2, (work.top + work.bottom) / 2),
            dpi as f64 / 96.0,
        )
    }

    fn blend(alpha: f64) -> BLENDFUNCTION {
        BLENDFUNCTION {
            BlendOp: AC_SRC_OVER as u8,
            BlendFlags: 0,
            SourceConstantAlpha: (alpha.clamp(0.0, 1.0) * 255.0).round() as u8,
            AlphaFormat: AC_SRC_ALPHA as u8,
        }
    }

    pub fn run(identifier: &str, ready: &AtomicBool, on_drawn: &dyn Fn()) {
        let (center, scale) = unsafe { primary_monitor() };
        let side = (LOGICAL * scale).round() as i32;
        let position = POINT {
            x: center.0 - side / 2,
            y: center.1 - side / 2,
        };

        unsafe {
            let instance = GetModuleHandleW(null());
            let class = class_name(identifier);
            let wc = WNDCLASSW {
                lpfnWndProc: Some(DefWindowProcW),
                hInstance: instance,
                lpszClassName: class.as_ptr(),
                ..zeroed()
            };
            RegisterClassW(&wc);
            let hwnd = CreateWindowExW(
                WS_EX_LAYERED
                    | WS_EX_TOOLWINDOW
                    | WS_EX_TOPMOST
                    | WS_EX_NOACTIVATE
                    | WS_EX_TRANSPARENT,
                class.as_ptr(),
                null(),
                WS_POPUP,
                position.x,
                position.y,
                side,
                side,
                null_mut(),
                null_mut(),
                instance,
                null(),
            );
            if hwnd.is_null() {
                on_drawn();
                return;
            }

            let dc = CreateCompatibleDC(null_mut());
            let mut info: BITMAPINFO = zeroed();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: side,
                biHeight: -side,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..zeroed()
            };
            let mut bits = null_mut();
            let bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
            let previous = SelectObject(dc, bitmap);
            let len = (side * side * 4) as usize;
            let pixels = std::slice::from_raw_parts_mut(bits as *mut u8, len);
            let size = SIZE { cx: side, cy: side };
            let origin = POINT { x: 0, y: 0 };

            let start = Instant::now();
            let mut shown = false;
            let mut fade: Option<f64> = None;
            let mut drawn_at: Option<f64> = None;
            loop {
                let mut msg: MSG = zeroed();
                while PeekMessageW(&mut msg, null_mut(), 0, 0, PM_REMOVE) != 0 {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                let t = start.elapsed().as_secs_f64();
                if t >= DRAW && drawn_at.is_none() {
                    drawn_at = Some(t);
                }
                let breath = drawn_at.map_or(1.0, |at| {
                    0.8 + 0.2 * (std::f64::consts::TAU * (t - at) / BREATH).cos()
                });
                if fade.is_none()
                    && ((drawn_at.is_some() && ready.load(Ordering::Relaxed)) || t >= TIMEOUT)
                {
                    on_drawn();
                    fade = Some(t);
                }
                let alpha = match fade {
                    Some(from) => {
                        let k = (t - from) / FADE_OUT;
                        if k >= 1.0 {
                            break;
                        }
                        1.0 - k * k * (3.0 - 2.0 * k)
                    }
                    None => 1.0,
                };
                render(pixels, side as usize, t.min(DRAW), breath);
                UpdateLayeredWindow(
                    hwnd,
                    null_mut(),
                    &position,
                    &size,
                    dc,
                    &origin,
                    0,
                    &blend(alpha),
                    ULW_ALPHA,
                );
                if !shown {
                    ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                    shown = true;
                }
                std::thread::sleep(Duration::from_millis(12));
            }

            DestroyWindow(hwnd);
            SelectObject(dc, previous);
            DeleteObject(bitmap);
            DeleteDC(dc);
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn already_running(_identifier: &str) -> bool {
        true
    }

    pub fn run(_identifier: &str, _ready: &std::sync::atomic::AtomicBool, on_drawn: &dyn Fn()) {
        on_drawn();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(t: f64) -> Vec<u8> {
        let size = 64;
        let mut buf = vec![0u8; size * size * 4];
        render(&mut buf, size, t, 1.0);
        buf
    }

    fn alpha_at(buf: &[u8], x: usize, y: usize) -> u8 {
        buf[(y * 64 + x) * 4 + 3]
    }

    #[test]
    fn starts_empty_and_ends_with_full_mark() {
        assert!(frame(0.0).chunks(4).all(|p| p[3] == 0));
        let end = frame(DRAW);
        assert_eq!(alpha_at(&end, 18, 32), 255);
        assert_eq!(alpha_at(&end, 37, 32), 255);
        assert_eq!(alpha_at(&end, 51, 32), 255);
        assert_eq!(alpha_at(&end, 50, 52), 0);
    }

    #[test]
    fn draws_dot_before_arcs() {
        let early = frame(0.3);
        assert!(alpha_at(&early, 18, 32) > 200);
        assert_eq!(alpha_at(&early, 51, 32), 0);
    }
}
