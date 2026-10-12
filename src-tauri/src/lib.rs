mod ocr;
mod secrets;
mod store;

use store::{Document, Fact, Hit, Imported, NewFact, Page, Stats, Store};
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

/// The file's bytes, sent to the interface so it can read the text (PDF) without anything leaving the Mac.
#[tauri::command]
fn document_bytes(store: State<Store>, id: String) -> Result<tauri::ipc::Response, String> {
    store.bytes_of(&id).map(tauri::ipc::Response::new)
}

/// Reads the text of a stored image document.
#[tauri::command]
async fn ocr_document(store: State<'_, Store>, id: String) -> Result<String, String> {
    let bytes = store.bytes_of(&id)?;
    ocr::read_image(&bytes)
}

/// Reads the text of an image sent as the request body (a scanned PDF page rendered by the interface).
#[tauri::command]
async fn ocr_image(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => ocr::read_image(bytes),
        _ => Err("Send the image as raw bytes.".into()),
    }
}

#[tauri::command]
fn get_secret(name: String) -> Result<Option<String>, String> {
    secrets::get(&name)
}

#[tauri::command]
fn set_secret(name: String, value: String) -> Result<(), String> {
    secrets::set(&name, &value)
}

#[tauri::command]
fn remove_secret(name: String) -> Result<(), String> {
    secrets::remove(&name)
}

#[tauri::command]
fn save_reading(store: State<Store>, id: String, pages: Vec<String>, method: String) -> Result<(), String> {
    store.save_reading(&id, pages, &method)
}

#[tauri::command]
fn document_pages(store: State<Store>, id: String) -> Result<Vec<Page>, String> {
    store.pages(&id)
}

#[tauri::command]
fn search(store: State<Store>, query: String, any: Option<bool>) -> Result<Vec<Hit>, String> {
    store.search(&query, any.unwrap_or(false))
}

#[tauri::command]
fn save_filing(store: State<Store>, id: String, title: String, area: String, doc_type: String, facts: Vec<NewFact>) -> Result<(), String> {
    store.save_filing(&id, &title, &area, &doc_type, facts)
}

#[tauri::command]
fn list_facts(store: State<Store>, status: String) -> Result<Vec<Fact>, String> {
    store.facts(&status)
}

#[tauri::command]
fn settle_fact(store: State<Store>, id: String, status: String, value: Option<String>) -> Result<(), String> {
    store.settle_fact(&id, &status, value)
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
        .invoke_handler(tauri::generate_handler![
            import_files,
            list_documents,
            library_stats,
            open_document,
            remove_document,
            document_bytes,
            save_reading,
            document_pages,
            search,
            save_filing,
            list_facts,
            settle_fact,
            ocr_document,
            ocr_image,
            get_secret,
            set_secret,
            remove_secret
        ])
        .run(tauri::generate_context!())
        .expect("error while running SafeBox");
}
