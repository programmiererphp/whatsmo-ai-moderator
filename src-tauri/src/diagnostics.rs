use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_FILE_BYTES: u64 = 48_000;
const MAX_FILES: usize = 5;
const MAX_TOTAL_BYTES: usize = 190_000;

// Only explicitly known diagnostic files are read, never the session database.
// Files may contain sensitive values, so the frontend redacts before export.
fn read_tail(path: &Path, max_bytes: u64) -> String {
    let Ok(mut file) = File::open(path) else {
        return String::new();
    };
    let Ok(metadata) = file.metadata() else {
        return String::new();
    };
    if file
        .seek(SeekFrom::Start(metadata.len().saturating_sub(max_bytes)))
        .is_err()
    {
        return String::new();
    }
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return String::new();
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn candidate_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(directory) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut paths: Vec<_> = directory
        .filter_map(|entry| entry.ok().map(|item| item.path()))
        .filter(|path| {
            path.is_file()
                && path.file_name().and_then(|s| s.to_str()).is_some_and(|name| {
                    name == "crash.log"
                        || name == "whatsmo.log"
                        || name.starts_with("whatsmo.log.")
                })
        })
        .collect();
    paths.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    paths.truncate(MAX_FILES);
    paths
}

#[tauri::command]
pub fn read_native_diagnostics(app: AppHandle) -> Result<String, String> {
    let mut report = String::new();
    let mut paths = Vec::new();
    if let Ok(log_dir) = app.path().app_log_dir() {
        paths.extend(candidate_files(&log_dir));
    }
    // Android Java/Kotlin exception handler writes to the app-private files
    // directory. Tauri's app_data_dir generally maps to the same directory.
    if let Ok(data_dir) = app.path().app_data_dir() {
        let android_crash = data_dir.join("whatsmo-android-crash.log");
        if android_crash.is_file() {
            paths.push(android_crash);
        }
    }

    for path in paths {
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("log");
        let tail = read_tail(&path, MAX_FILE_BYTES);
        if tail.is_empty() {
            continue;
        }
        report.push_str("\n--- ");
        report.push_str(name);
        report.push_str(" ---\n");
        report.push_str(&tail);
        if report.len() > MAX_TOTAL_BYTES {
            report = report[report.len() - MAX_TOTAL_BYTES..].to_string();
            break;
        }
    }

    if report.is_empty() {
        return Ok("No native crash or Rust log files found yet.".into());
    }
    Ok(report)
}
