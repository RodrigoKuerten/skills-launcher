#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    net::{TcpStream, ToSocketAddrs},
    path::PathBuf,
    sync::Mutex,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, RunEvent,
};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct CompanionProcess(Mutex<Option<CommandChild>>);

fn companion_running() -> bool {
    let address = match "127.0.0.1:4780".to_socket_addrs() {
        Ok(mut addresses) => match addresses.next() {
            Some(address) => address,
            None => return false,
        },
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}

fn token_path() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    PathBuf::from(home).join(".skills-hub").join("agent.token")
}

#[tauri::command]
fn read_token() -> Result<String, String> {
    for _ in 0..24 {
        if let Ok(value) = fs::read_to_string(token_path()) {
            let token = value.trim().to_string();
            if !token.is_empty() {
                return Ok(token);
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("Pairing token not found. Let the companion start, then reopen this window.".into())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let allowed = url == "http://localhost:3000"
        || url == "http://127.0.0.1:3000"
        || url == "http://localhost:3000/my-agents"
        || url == "http://127.0.0.1:3000/my-agents"
        || url.starts_with("https://");
    if !allowed {
        return Err("URL not allowed by the desktop companion.".into());
    }
    open::that(url).map_err(|error| error.to_string())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![read_token, open_url])
        .setup(|app| {
            if !companion_running() {
                let origins = "http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://localhost:3000,http://127.0.0.1:3000";
                let (mut events, child) = app
                    .shell()
                    .sidecar("skills-hub-agent")?
                    .env("AGENT_ALLOWED_ORIGINS", origins)
                    .spawn()?;
                app.manage(CompanionProcess(Mutex::new(Some(child))));
                tauri::async_runtime::spawn(async move {
                    while events.recv().await.is_some() {}
                });
            } else {
                app.manage(CompanionProcess(Mutex::new(None)));
            }

            let show = MenuItem::with_id(app, "show", "Show companion", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Open My Agents", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &open, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "open" => {
                        let _ = open::that("http://localhost:3000/my-agents");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Skills Hub Companion");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<CompanionProcess>() {
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
