use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MODE_FILE: &str = "whatsmo-safe-mode.flag";
const JS_SNAPSHOT_FILE: &str = "whatsmo-js-diagnostics.log";
const MAX_SNAPSHOT_BYTES: usize = 50_000;

fn native_files_dir(app: &AppHandle) -> PathBuf {
    // Android's Context.filesDir is normally /data/user/0/<package>/files.
    // Use the same location as RecoveryActivity so its independent process can
    // read snapshots even when Tauri itself fails to start on the next run.
    #[cfg(target_os = "android")]
    {
        let android_dir = PathBuf::from("/data/user/0/com.whatsmo.mobile/files");
        if android_dir.is_dir() {
            return android_dir;
        }
    }
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
pub fn get_recovery_safe_mode(app: AppHandle) -> bool {
    native_files_dir(&app).join(MODE_FILE).exists()
}

#[tauri::command]
pub fn write_js_diagnostics_snapshot(app: AppHandle, content: String) -> Result<(), String> {
    if content.len() > MAX_SNAPSHOT_BYTES {
        return Err("Diagnostic snapshot exceeds bounded size".into());
    }
    let dir = native_files_dir(&app);
    fs::create_dir_all(&dir).map_err(|error| format!("Cannot open diagnostics directory: {}", error.kind()))?;
    let destination = dir.join(JS_SNAPSHOT_FILE);
    let temporary = dir.join("whatsmo-js-diagnostics.tmp");
    fs::write(&temporary, content).map_err(|error| format!("Cannot write diagnostic snapshot: {}", error.kind()))?;
    fs::rename(&temporary, &destination)
        .map_err(|error| format!("Cannot commit diagnostic snapshot: {}", error.kind()))?;
    Ok(())
}
