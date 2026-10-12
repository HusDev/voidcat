mod store;

use store::{Document, Imported, Stats, Store};
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn import_files(store: State<Store>, paths: Vec<String>) -> Imported {
    store.import(paths)
}

#[tauri::command]
fn list_documents(store: State<Store>) -> Result<Vec<Document>, String> {
    store.list()
}

#[tauri::command]
fn library_stats(store: State<Store>) -> Result<Stats, String> {
    store.stats()
}

#[tauri::command]
fn open_document(app: tauri::AppHandle, store: State<Store>, id: String) -> Result<(), String> {
    let path = store.path_of(&id)?;
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_document(store: State<Store>, id: String) -> Result<(), String> {
    store.remove(&id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let store = Store::open(&dir).map_err(|e| format!("Could not open the library in {}: {e}", dir.display()))?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![import_files, list_documents, library_stats, open_document, remove_document])
        .run(tauri::generate_context!())
        .expect("error while running SafeBox");
}
