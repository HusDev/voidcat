//! Converting office documents with what macOS already has: `textutil` between Word, OpenDocument, rich text, web
//! pages and plain text, and AppKit's own printing (run by `osascript`) for PDF, paginated on A4. Nothing is
//! downloaded and nothing leaves the Mac; the plain copy lives in the library's "opened" folder only while it works.

use crate::store::Store;
use std::{fs, process::Command};

/// What the files can be turned into, by `textutil`'s names (plus pdf).
const TARGETS: [&str; 6] = ["pdf", "docx", "odt", "rtf", "html", "txt"];
/// What `textutil` reads.
const SOURCES: [&str; 6] = ["docx", "odt", "rtf", "html", "htm", "txt"];

/// Lays the document out with AppKit and prints it to a PDF file: A4, 2 cm margins, as many pages as it needs.
const TO_PDF: &str = r#"ObjC.import('AppKit');
function run(argv) {
  const text = $.NSAttributedString.alloc.initWithURLOptionsDocumentAttributesError($.NSURL.fileURLWithPath(argv[0]), $({}), null, null);
  if (!text || text.isNil()) throw new Error('This document could not be read.');
  const info = $.NSPrintInfo.sharedPrintInfo.copy;
  info.paperSize = $.NSMakeSize(595.28, 841.89);
  info.topMargin = 56; info.bottomMargin = 56; info.leftMargin = 56; info.rightMargin = 56;
  info.horizontalPagination = $.NSPrintingPaginationModeFit;
  info.verticalPagination = $.NSPrintingPaginationModeAutomatic;
  info.jobDisposition = $.NSPrintSaveJob;
  info.dictionary.setObjectForKey($.NSURL.fileURLWithPath(argv[1]), $.NSPrintJobSavingURL);
  const width = 595.28 - 112;
  const view = $.NSTextView.alloc.initWithFrame($.NSMakeRect(0, 0, width, 10));
  view.textStorage.setAttributedString(text);
  view.horizontallyResizable = false; view.verticallyResizable = true;
  view.textContainer.containerSize = $.NSMakeSize(width, 1e7);
  view.layoutManager.ensureLayoutForTextContainer(view.textContainer);
  view.sizeToFit;
  const op = $.NSPrintOperation.printOperationWithViewPrintInfo(view, info);
  op.showsPrintPanel = false; op.showsProgressPanel = false;
  if (!op.runOperation) throw new Error('The PDF could not be made.');
}"#;

/// The document `id` converted to `to` (pdf, docx, odt, rtf, html or txt), as bytes.
pub fn office(store: &Store, id: &str, to: &str) -> Result<Vec<u8>, String> {
    if !TARGETS.contains(&to) {
        return Err(format!("Voidcat can't convert to .{to}."));
    }
    let (name, bytes) = store.contents_of(&[id.to_string()])?.remove(0);
    let from = std::path::Path::new(&name).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !SOURCES.contains(&from.as_str()) {
        return Err("Only Word, OpenDocument, rich text, web pages and text can be converted this way.".into());
    }
    let dir = store.opened_dir().join(format!("convert-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let result = (|| {
        let input = dir.join(format!("in.{from}"));
        let output = dir.join(format!("out.{to}"));
        fs::write(&input, &bytes).map_err(|e| e.to_string())?;
        let ran = if to == "pdf" {
            let script = dir.join("to-pdf.js");
            fs::write(&script, TO_PDF).map_err(|e| e.to_string())?;
            Command::new("/usr/bin/osascript").arg("-l").arg("JavaScript").arg(&script).arg(&input).arg(&output).output()
        } else {
            Command::new("/usr/bin/textutil").args(["-convert", to, "-output"]).arg(&output).arg(&input).output()
        }
        .map_err(|e| e.to_string())?;
        if !ran.status.success() {
            let why = String::from_utf8_lossy(&ran.stderr);
            return Err(format!("The conversion failed: {}", why.lines().last().unwrap_or("no reason given")));
        }
        fs::read(&output).map_err(|_| "The conversion made nothing.".to_string())
    })();
    let _ = fs::remove_dir_all(&dir);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_what_it_cant_convert() {
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4()));
        let store = Store::open(&dir, crate::vault::Vault::from_master(&[3; 32])).unwrap();
        let src = dir.join("scan.pdf");
        fs::write(&src, b"%PDF-1.4").unwrap();
        store.import(vec![src.to_string_lossy().to_string()]);
        let id = store.list().unwrap()[0].id.clone();
        assert!(office(&store, &id, "exe").is_err());
        assert!(office(&store, &id, "odt").is_err(), "a PDF isn't a textutil source");
    }

    /// Runs the real macOS tools; skipped where they don't exist (Linux CI).
    #[test]
    fn converts_text_with_the_macs_own_tools() {
        if !std::path::Path::new("/usr/bin/textutil").exists() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("voidcat-test-{}", uuid::Uuid::new_v4()));
        let store = Store::open(&dir, crate::vault::Vault::from_master(&[3; 32])).unwrap();
        let src = dir.join("letter.txt");
        fs::write(&src, "Dear landlord,\nthe heating is broken.").unwrap();
        store.import(vec![src.to_string_lossy().to_string()]);
        let id = store.list().unwrap()[0].id.clone();
        assert!(office(&store, &id, "rtf").unwrap().starts_with(b"{\\rtf"));
        assert!(office(&store, &id, "docx").unwrap().starts_with(b"PK"));
        assert!(office(&store, &id, "pdf").unwrap().starts_with(b"%PDF"));
        assert!(fs::read_dir(store.opened_dir()).map(|d| d.count()).unwrap_or(0) == 0, "the plain copies are gone");
    }
}
