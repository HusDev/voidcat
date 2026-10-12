mod apps;
mod calendar;
mod ocr;
mod opportunities;
mod secrets;
mod store;

use store::{Document, Fact, Folder, Hit, Imported, NewFact, Page, Stats, Store, Suggestion};
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
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
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
fn list_events(store: State<Store>) -> Result<Vec<calendar::Event>, String> {
    calendar::events(&store.db.lock().unwrap())
}

#[tauri::command]
fn add_event(store: State<Store>, event: calendar::Event) -> Result<String, String> {
    calendar::add_event(&store.db.lock().unwrap(), event)
}

#[tauri::command]
fn remove_event(store: State<Store>, id: String) -> Result<(), String> {
    calendar::remove_event(&store.db.lock().unwrap(), &id)
}

#[tauri::command]
fn set_event_done(store: State<Store>, key: String, done: bool) -> Result<(), String> {
    calendar::set_done(&store.db.lock().unwrap(), &key, done)
}

#[tauri::command]
fn done_event_keys(store: State<Store>) -> Result<Vec<String>, String> {
    calendar::done_keys(&store.db.lock().unwrap())
}

#[tauri::command]
fn event_papers(store: State<Store>, key: String) -> Result<Vec<calendar::Paper>, String> {
    calendar::papers(&store.db.lock().unwrap(), &key)
}

#[tauri::command]
fn set_event_papers(store: State<Store>, key: String, papers: Vec<calendar::Paper>) -> Result<(), String> {
    calendar::set_papers(&mut store.db.lock().unwrap(), &key, papers)
}

#[tauri::command]
fn claim_reminder(store: State<Store>, key: String) -> Result<bool, String> {
    calendar::claim_reminder(&store.db.lock().unwrap(), &key)
}

#[tauri::command]
fn list_opportunities(store: State<Store>) -> Result<Vec<opportunities::Opportunity>, String> {
    opportunities::list(&store.db.lock().unwrap())
}

#[tauri::command]
fn save_opportunities(store: State<Store>, found: Vec<opportunities::Opportunity>) -> Result<(), String> {
    opportunities::save_scan(&mut store.db.lock().unwrap(), found)
}

#[tauri::command]
fn set_opportunity_status(store: State<Store>, key: String, status: String) -> Result<(), String> {
    opportunities::set_status(&store.db.lock().unwrap(), &key, &status)
}

#[tauri::command]
fn list_ai_apps(store: State<Store>) -> Result<Vec<apps::App>, String> {
    apps::list(&store.db.lock().unwrap())
}

#[tauri::command]
fn set_ai_app_level(store: State<Store>, name: String, level: String) -> Result<(), String> {
    apps::set_level(&store.db.lock().unwrap(), &name, &level)
}

#[tauri::command]
fn remove_ai_app(store: State<Store>, name: String) -> Result<(), String> {
    apps::remove(&store.db.lock().unwrap(), &name)
}

/// The MCP server's path, and which apps already start it.
#[tauri::command]
fn mcp_setup() -> serde_json::Value {
    serde_json::json!({
        "server": apps::server_path().map(|p| p.to_string_lossy().into_owned()).ok(),
        "claudeDesktop": apps::is_connected("claude-desktop"),
        "cursor": apps::is_connected("cursor"),
    })
}

#[tauri::command]
fn connect_app(app: String, on: bool) -> Result<(), String> {
    apps::connect(&app, on)
}

/// Writes the calendar export where the user chose in the save dialog. Only .ics files.
#[tauri::command]
fn save_calendar_file(path: String, content: String) -> Result<(), String> {
    if !path.to_lowercase().ends_with(".ics") {
        return Err("The calendar file must end in .ics.".into());
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_reading(
    store: State<Store>,
    id: String,
    pages: Vec<String>,
    method: String,
) -> Result<(), String> {
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
fn save_filing(
    store: State<Store>,
    id: String,
    title: String,
    area: String,
    doc_type: String,
    facts: Vec<NewFact>,
    suggestion: Option<Suggestion>,
) -> Result<(), String> {
    store.save_filing(&id, &title, &area, &doc_type, facts, suggestion)
}

#[tauri::command]
fn list_folders(store: State<Store>) -> Result<Vec<Folder>, String> {
    store.folders()
}

#[tauri::command]
fn file_document(
    store: State<Store>,
    id: String,
    area: String,
    name: String,
) -> Result<String, String> {
    store.file_document(&id, &area, &name)
}

#[tauri::command]
fn rename_folder(store: State<Store>, id: String, name: String) -> Result<(), String> {
    store.rename_folder(&id, &name)
}

#[tauri::command]
fn list_facts(store: State<Store>, status: String) -> Result<Vec<Fact>, String> {
    store.facts(&status)
}

#[tauri::command]
fn settle_fact(
    store: State<Store>,
    id: String,
    status: String,
    value: Option<String>,
) -> Result<(), String> {
    store.settle_fact(&id, &status, value)
}

#[tauri::command]
fn remove_document(store: State<Store>, id: String) -> Result<(), String> {
    store.remove(&id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let store = Store::open(&dir)
                .map_err(|e| format!("Could not open the library in {}: {e}", dir.display()))?;
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
            remove_secret,
            list_folders,
            file_document,
            rename_folder,
            list_events,
            add_event,
            remove_event,
            set_event_done,
            done_event_keys,
            event_papers,
            set_event_papers,
            claim_reminder,
            save_calendar_file,
            list_opportunities,
            save_opportunities,
            set_opportunity_status,
            list_ai_apps,
            set_ai_app_level,
            remove_ai_app,
            mcp_setup,
            connect_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running SafeBox");
}
