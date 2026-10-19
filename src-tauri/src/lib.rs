mod apps;
mod bundle;
mod calendar;
mod chats;
mod cloud;
mod cloud_signin;
mod docx;
mod labels;
mod legacy;
mod mcp_bridge;
mod ocr;
mod opportunities;
mod people;
mod secrets;
mod sheets;
mod store;
mod vault;

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
    // The stored file is encrypted: the other app gets a decrypted copy, removed when Voidcat next starts.
    let path = store.plain_copy(&id)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
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

/// A new, empty note (Markdown or plain text), filed in `folder_id` when given.
#[tauri::command]
fn create_note(store: State<Store>, title: String, kind: String, folder_id: Option<String>) -> Result<Document, String> {
    store.create_note(&title, &kind, folder_id.as_deref())
}

/// Saves a text document's contents; `keep_previous` on an editing session's first save.
#[tauri::command]
fn save_note(store: State<Store>, id: String, text: String, keep_previous: bool) -> Result<(), String> {
    store.save_note(&id, &text, keep_previous)
}

/// Keeps a signed PDF (the request body) made from the document in `x-voidcat-id` as a new document beside it.
#[tauri::command]
fn save_signed(store: State<Store>, request: tauri::ipc::Request<'_>) -> Result<Document, String> {
    let id = request.headers().get("x-voidcat-id").and_then(|v| v.to_str().ok()).ok_or("Missing x-voidcat-id.")?;
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => store.save_signed(id, bytes),
        _ => Err("Send the PDF as raw bytes.".into()),
    }
}

/// Your saved signature (a PNG), or nothing.
#[tauri::command]
fn get_signature(store: State<Store>) -> Result<tauri::ipc::Response, String> {
    Ok(tauri::ipc::Response::new(store.signature()?.unwrap_or_default()))
}

#[tauri::command]
fn save_signature(store: State<Store>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => store.save_signature(bytes),
        _ => Err("Send the signature as raw bytes.".into()),
    }
}

#[tauri::command]
fn forget_signature(store: State<Store>) -> Result<(), String> {
    store.forget_signature()
}

/// Removes a note closed while still empty and "Untitled"; true when it did.
#[tauri::command]
fn discard_empty_note(store: State<Store>, id: String) -> Result<bool, String> {
    store.discard_empty_note(&id)
}

#[tauri::command]
fn has_previous_version(store: State<Store>, id: String) -> Result<bool, String> {
    store.has_previous(&id)
}

#[tauri::command]
fn restore_previous_version(store: State<Store>, id: String) -> Result<(), String> {
    store.restore_previous(&id)
}

/// Writes an exported copy of a note (Word, Markdown or text) where the save dialog said, sent as the request body.
#[tauri::command]
fn save_export_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = request.headers().get("x-voidcat-path").and_then(|v| v.to_str().ok()).ok_or("Missing x-voidcat-path.")?;
    let path = String::from_utf8(hex::decode(path).map_err(|_| "Bad path.")?).map_err(|_| "Bad path.")?;
    let lower = path.to_lowercase();
    if ![".docx", ".md", ".txt"].iter().any(|e| lower.ends_with(e)) {
        return Err("Export as .docx, .md or .txt.".into());
    }
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => std::fs::write(path, bytes).map_err(|e| e.to_string()),
        _ => Err("Send the file as raw bytes.".into()),
    }
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

/// Whether the Ollama app is installed (it runs the local model), so Voidcat can offer "Open Ollama".
#[tauri::command]
fn ollama_installed() -> bool {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from).unwrap_or_default();
    ["/Applications/Ollama.app".into(), home.join("Applications/Ollama.app")].iter().any(|p: &std::path::PathBuf| p.exists())
}

/// This Mac's memory in GB, so the local model choices can say which ones fit.
#[tauri::command]
fn mac_memory_gb() -> u64 {
    std::process::Command::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().ok())
        .map(|bytes| bytes / 1_073_741_824)
        .unwrap_or(16)
}

#[tauri::command]
fn open_ollama() -> Result<(), String> {
    std::process::Command::new("open").args(["-a", "Ollama"]).status().map_err(|e| e.to_string())?;
    Ok(())
}

/// The library folder, while its key is missing and the recovery key hasn't been entered yet.
struct Locked(std::path::PathBuf);

#[tauri::command]
fn library_locked(app: tauri::AppHandle) -> bool {
    app.try_state::<Locked>().is_some()
}

/// Opens a locked library with the recovery key: checked against the library first, then saved to the Keychain and
/// the app restarts normally.
#[tauri::command]
fn recover_library(app: tauri::AppHandle, code: String) -> Result<(), String> {
    let Some(locked) = app.try_state::<Locked>() else { return Ok(()) };
    let vault = vault::Vault::from_recovery_code(&code)?;
    if !Store::opens(&locked.0, &vault) {
        return Err("That recovery key doesn't open this library. Check each group of four and try again.".into());
    }
    vault.save()?;
    app.restart();
}

/// The recovery key, shown in Settings only when asked for.
#[tauri::command]
fn recovery_code(store: State<Store>) -> String {
    store.recovery_code()
}

/// Every document, decrypted, in one .zip sorted into its folders.
#[tauri::command]
fn export_all(store: State<Store>, path: String) -> Result<usize, String> {
    let all = store.export_all()?;
    let count = all.len();
    bundle::write(&path, all)?;
    Ok(count)
}

/// Saves documents as one .zip at the path the user chose in the save dialog.
#[tauri::command]
fn save_zip(store: State<Store>, path: String, ids: Vec<String>) -> Result<(), String> {
    bundle::write(&path, store.contents_of(&ids)?)
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
/// Voidcat Cloud on the Mac (see `cloud.rs`): the interface signs in and uploads; these decide and seal what goes up.
#[tauri::command]
fn cloud_account(store: State<Store>) -> Result<Option<cloud::Account>, String> {
    store.cloud_account()
}

#[tauri::command]
fn cloud_connect(store: State<Store>, uid: String, email: Option<String>) -> Result<(), String> {
    store.cloud_connect(&uid, email.as_deref())
}

#[tauri::command]
fn cloud_disconnect(store: State<Store>) -> Result<(), String> {
    store.cloud_disconnect()
}

#[tauri::command]
fn cloud_forget_uploads(store: State<Store>) -> Result<(), String> {
    store.cloud_forget_uploads()
}

#[tauri::command]
fn cloud_set_new_documents(store: State<Store>, on: bool) -> Result<(), String> {
    store.cloud_set_new_documents(on)
}

#[tauri::command]
fn cloud_keep(store: State<Store>, id: String, keep: bool) -> Result<(), String> {
    store.cloud_keep(&id, keep)
}

#[tauri::command]
fn cloud_plan(store: State<Store>) -> Result<cloud::Plan, String> {
    store.cloud_plan()
}

#[tauri::command]
fn cloud_record(store: State<Store>, id: String) -> Result<tauri::ipc::Response, String> {
    store.cloud_record(&id).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn cloud_file(store: State<Store>, id: String) -> Result<tauri::ipc::Response, String> {
    store.cloud_file(&id).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn cloud_uploaded(store: State<Store>, id: String, record_hash: String, file_hash: String) -> Result<(), String> {
    store.cloud_uploaded(&id, &record_hash, &file_hash)
}

#[tauri::command]
fn cloud_removed(store: State<Store>, id: String) -> Result<(), String> {
    store.cloud_removed(&id)
}

#[tauri::command]
fn cloud_failed(store: State<Store>, id: String, error: String) -> Result<(), String> {
    store.cloud_failed(&id, &error)
}

#[tauri::command]
fn cloud_marks(store: State<Store>) -> Result<Vec<cloud::Mark>, String> {
    store.cloud_marks()
}

#[tauri::command]
fn cloud_check(store: State<Store>) -> Result<tauri::ipc::Response, String> {
    store.cloud_check().map(tauri::ipc::Response::new)
}

#[tauri::command]
fn cloud_opens(store: State<Store>, check: Vec<u8>) -> bool {
    store.cloud_opens(&check)
}

/// Joins a cloud library made elsewhere: the recovery key must open it; the whole library is re-locked with that
/// key (a copy kept beside it first), the Keychain gets the new key and the app restarts.
#[tauri::command]
fn cloud_join(app: tauri::AppHandle, store: State<Store>, code: String, check: Vec<u8>, uid: String, email: Option<String>) -> Result<(), String> {
    let new = vault::Vault::from_recovery_code(&code)?;
    if !cloud::opens(&new, &check) {
        return Err("That recovery key doesn't open your cloud library. Check each group of four and try again.".into());
    }
    // Connected before re-locking, so the re-locked library starts syncing after the restart.
    store.cloud_connect(&uid, email.as_deref())?;
    if let Err(e) = store.rekey(&new, || new.save()) {
        let _ = store.cloud_disconnect();
        return Err(e);
    }
    app.restart();
}

/// One browser edit (sealed), applied on this Mac.
#[tauri::command]
fn cloud_apply(store: State<Store>, sealed: Vec<u8>) -> Result<cloud::Applied, String> {
    store.cloud_apply(&sealed)
}

/// A file added in a browser, sent as raw bytes (still sealed) with its id and name in headers.
#[tauri::command]
fn cloud_import(store: State<Store>, request: tauri::ipc::Request<'_>) -> Result<Option<Document>, String> {
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_string).ok_or(format!("Missing {name}."));
    let id = header("x-voidcat-id")?;
    let name = header("x-voidcat-name")?;
    let name = String::from_utf8(hex::decode(name).map_err(|_| "Bad file name.")?).map_err(|_| "Bad file name.")?;
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => store.cloud_import(&id, &name, bytes),
        _ => Err("Send the file as raw bytes.".into()),
    }
}

#[tauri::command]
fn cloud_listen(app: tauri::AppHandle, config: cloud_signin::WebConfig) -> Result<cloud_signin::Listening, String> {
    cloud_signin::listen(app, config)
}

#[tauri::command]
fn cloud_stop_listening() {
    cloud_signin::stop();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        // Closing the window hides it: Voidcat keeps running in the menu bar so calendar reminders still arrive.
        // ⌘Q or the menu bar's Quit really quits.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            menu_bar(app)?;
            // VOIDCAT_DIR opens another library (a demo with invented documents, say) and leaves the real one and
            // other apps' settings alone.
            let dir = match std::env::var_os("VOIDCAT_DIR") {
                Some(d) => std::path::PathBuf::from(d),
                None => {
                    let dir = app.path().app_data_dir()?;
                    legacy::move_library(&dir)?;
                    // Other apps set up under the old name, or before the app moved, start this copy of the server.
                    for name in ["claude-desktop", "cursor"] {
                        apps::sync_entry(name);
                    }
                    dir
                }
            };
            let vault = match vault::Vault::load(&dir.join(legacy::DB)) {
                Ok(v) => v,
                // The key is gone but the library is there: the window opens on "Enter your recovery key".
                Err(vault::Load::Missing) => {
                    app.manage(Locked(dir));
                    return Ok(());
                }
                Err(vault::Load::Failed(e)) => {
                    // Without the key nothing can be opened: say why in a window instead of quietly failing.
                    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                    app.dialog().message(e).title("Voidcat can't open your library").kind(MessageDialogKind::Error).blocking_show();
                    std::process::exit(1);
                }
            };
            let store = Store::open(&dir, vault)
                .map_err(|e| format!("Could not open the library in {}: {e}", dir.display()))?;
            app.manage(store);
            // The MCP server reads the library through the app, since only the app holds the key.
            if let Err(e) = mcp_bridge::start(app.handle().clone(), &dir) {
                eprintln!("{e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ollama_installed,
            mac_memory_gb,
            open_ollama,
            library_locked,
            recover_library,
            recovery_code,
            export_all,
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
            create_note,
            save_note,
            has_previous_version,
            discard_empty_note,
            save_signed,
            get_signature,
            save_signature,
            forget_signature,
            restore_previous_version,
            save_export_file,
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
            choose_profile_value,
            cloud_account,
            cloud_connect,
            cloud_disconnect,
            cloud_forget_uploads,
            cloud_set_new_documents,
            cloud_keep,
            cloud_plan,
            cloud_record,
            cloud_file,
            cloud_uploaded,
            cloud_removed,
            cloud_failed,
            cloud_marks,
            cloud_check,
            cloud_opens,
            cloud_join,
            cloud_apply,
            cloud_import,
            cloud_listen,
            cloud_stop_listening
        ])
        .build(tauri::generate_context!())
        .expect("error while building Voidcat")
        .run(|_app, _event| {
            // Clicking the Dock icon brings the hidden window back (a macOS-only event; CI builds on Linux).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_window(_app);
            }
        });
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// The cat in the menu bar: open the window again, or quit for real.
fn menu_bar(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;
    let open = MenuItem::with_id(app, "open", "Open Voidcat", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Voidcat", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("voidcat")
        .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("Voidcat")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
