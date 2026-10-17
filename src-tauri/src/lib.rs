mod apps;
mod bundle;
mod calendar;
mod chats;
mod docx;
mod labels;
mod legacy;
mod ocr;
mod opportunities;
mod people;
mod secrets;
mod sheets;
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

/// Renames a document (its title in Voidcat; the stored file is untouched).
#[tauri::command]
fn rename_document(store: State<Store>, id: String, title: String) -> Result<(), String> {
    store.rename_document(&id, &title)
}

#[tauri::command]
fn list_labels(store: State<Store>) -> Result<Vec<labels::Label>, String> {
    labels::list(&store.db.lock().unwrap())
}

/// Automatic labels of these kinds, worked out afresh (for one document when `document_id` is given).
#[tauri::command]
fn replace_auto_labels(store: State<Store>, kinds: Vec<String>, labels: Vec<labels::NewLabel>, document_id: Option<String>) -> Result<(), String> {
    labels::replace_auto(&mut store.db.lock().unwrap(), &kinds, labels, document_id.as_deref())
}

#[tauri::command]
fn set_label(store: State<Store>, document_id: String, kind: String, note: Option<String>) -> Result<(), String> {
    labels::set(&store.db.lock().unwrap(), &document_id, &kind, note)
}

#[tauri::command]
fn remove_label(store: State<Store>, document_id: String, kind: String) -> Result<(), String> {
    labels::remove(&store.db.lock().unwrap(), &document_id, &kind)
}

#[tauri::command]
fn reset_label_checks(store: State<Store>, kinds: Vec<String>) -> Result<(), String> {
    labels::reset_checks(&store.db.lock().unwrap(), &kinds)
}

#[tauri::command]
fn unchecked_for_labels(store: State<Store>) -> Result<Vec<String>, String> {
    labels::unchecked(&store.db.lock().unwrap())
}

/// Saves documents as one .zip at the path the user chose in the save dialog.
#[tauri::command]
fn save_zip(store: State<Store>, path: String, ids: Vec<String>) -> Result<(), String> {
    bundle::write(&path, store.files_of(&ids)?)
}

/// Moves a folder and its documents to another area (merging with a folder of the same name there).
#[tauri::command]
fn move_folder(store: State<Store>, id: String, area: String) -> Result<String, String> {
    store.move_folder(&id, &area)
}

/// Files a document again (area, type, folder), keeping its facts.
#[tauri::command]
fn refile_document(store: State<Store>, id: String, area: String, doc_type: String, suggestion: Suggestion) -> Result<(), String> {
    store.refile(&id, &area, &doc_type, suggestion)
}

/// A stored Word document's text, as pages, read on this Mac.
#[tauri::command]
async fn read_docx(store: State<'_, Store>, id: String) -> Result<Vec<String>, String> {
    docx::read(store.bytes_of(&id)?)
}

/// A stored spreadsheet's sheets as rows of text, read on this Mac.
#[tauri::command]
async fn read_sheets(store: State<'_, Store>, id: String) -> Result<Vec<sheets::Sheet>, String> {
    sheets::read(store.bytes_of(&id)?)
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
fn list_chats(store: State<Store>) -> Result<Vec<chats::Chat>, String> {
    chats::list(&store.db.lock().unwrap())
}

#[tauri::command]
fn get_chat(store: State<Store>, id: String) -> Result<Option<String>, String> {
    chats::get(&store.db.lock().unwrap(), &id)
}

#[tauri::command]
fn save_chat(store: State<Store>, id: String, title: String, body: String) -> Result<(), String> {
    chats::save(&store.db.lock().unwrap(), &id, &title, &body)
}

#[tauri::command]
fn delete_chat(store: State<Store>, id: String) -> Result<(), String> {
    chats::delete(&store.db.lock().unwrap(), &id)
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

#[tauri::command]
fn save_contacts(store: State<Store>, document_id: String, found: Vec<people::Found>) -> Result<(), String> {
    people::save_found(&mut store.db.lock().unwrap(), &document_id, found)
}

#[tauri::command]
fn list_contacts(store: State<Store>) -> Result<Vec<people::Contact>, String> {
    people::list(&store.db.lock().unwrap())
}

#[tauri::command]
fn edit_contact(store: State<Store>, id: String, contact: people::Edit) -> Result<(), String> {
    people::edit(&store.db.lock().unwrap(), &id, contact)
}

#[tauri::command]
fn flag_contact(store: State<Store>, id: String, flag: String) -> Result<(), String> {
    people::set_flag(&store.db.lock().unwrap(), &id, &flag)
}

#[tauri::command]
fn owner_names(store: State<Store>) -> Result<Vec<String>, String> {
    people::owner_names(&store.db.lock().unwrap())
}

#[tauri::command]
fn unscanned_for_contacts(store: State<Store>) -> Result<Vec<String>, String> {
    people::unscanned(&store.db.lock().unwrap())
}

/// The saved profile as JSON with when it was built, or null.
#[tauri::command]
fn get_profile(store: State<Store>) -> Result<Option<(String, String)>, String> {
    people::profile(&store.db.lock().unwrap())
}

#[tauri::command]
fn save_profile(store: State<Store>, json: String) -> Result<(), String> {
    people::save_profile(&store.db.lock().unwrap(), &json)
}

#[tauri::command]
fn profile_choices(store: State<Store>) -> Result<Vec<(String, String)>, String> {
    people::choices(&store.db.lock().unwrap())
}

#[tauri::command]
fn choose_profile_value(store: State<Store>, key: String, fact_id: String) -> Result<(), String> {
    people::choose(&store.db.lock().unwrap(), &key, &fact_id)
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
            legacy::move_library(&dir)?;
            // Other apps set up under the old name, or before the app moved, start this copy of the server.
            for name in ["claude-desktop", "cursor"] {
                apps::sync_entry(name);
            }
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
            read_sheets,
            read_docx,
            refile_document,
            move_folder,
            rename_document,
            save_zip,
            list_labels,
            replace_auto_labels,
            set_label,
            remove_label,
            unchecked_for_labels,
            reset_label_checks,
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
            list_chats,
            get_chat,
            save_chat,
            delete_chat,
            list_ai_apps,
            set_ai_app_level,
            remove_ai_app,
            mcp_setup,
            connect_app,
            save_contacts,
            list_contacts,
            edit_contact,
            flag_contact,
            owner_names,
            unscanned_for_contacts,
            get_profile,
            save_profile,
            profile_choices,
            choose_profile_value
        ])
        .run(tauri::generate_context!())
        .expect("error while running Voidcat");
}
