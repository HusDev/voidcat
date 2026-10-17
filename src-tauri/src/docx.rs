//! Word documents (.docx) read on this Mac: the text of word/document.xml, paragraph by paragraph, table cells
//! separated by " | ", and a new page wherever the document has a page break.

use std::io::{Cursor, Read};
use zip::ZipArchive;

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

/// The text of a document.xml, as pages.
pub fn text_of(xml: &str) -> Vec<String> {
    let mut pages = vec![String::new()];
    let mut rest = xml;
    while let Some(start) = rest.find('<') {
        let Some(end) = rest[start..].find('>') else { break };
        let tag = &rest[start + 1..start + end];
        let after = &rest[start + end + 1..];
        // A closing tag (</w:p>) has no name here; it's matched whole below.
        let name = if tag.starts_with('/') { "" } else { tag.split([' ', '/']).next().unwrap_or("") };
        let page = pages.last_mut().unwrap();
        match name {
            // Text runs: <w:t>…</w:t> (not self-closing).
            "w:t" if !tag.ends_with('/') => {
                let close = after.find("</w:t>").unwrap_or(after.len());
                page.push_str(&unescape(&after[..close]));
                rest = &after[close..];
                continue;
            }
            "w:tab" => page.push('\t'),
            "w:br" if tag.contains("w:type=\"page\"") => pages.push(String::new()),
            "w:br" | "w:cr" => page.push('\n'),
            _ if tag == "/w:tc" => page.push_str(" | "),
            _ if tag == "/w:p" || tag == "/w:tr" => {
                // A row's last cell leaves " | " behind; a row ends a line.
                if page.ends_with(" | ") {
                    page.truncate(page.len() - 3);
                }
                if !page.ends_with('\n') {
                    page.push('\n');
                }
            }
            _ => {}
        }
        rest = after;
    }
    pages.into_iter().map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect()
}

/// Reads a .docx file's bytes into pages of text.
pub fn read(bytes: Vec<u8>) -> Result<Vec<String>, String> {
    let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(|_| "This Word file could not be opened.".to_string())?;
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .map_err(|_| "This Word file has no text part.".to_string())?
        .read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;
    Ok(text_of(&xml))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_paragraphs_tables_and_page_breaks() {
        let xml = r#"<w:document><w:body>
            <w:p><w:r><w:t>Curriculum Vitae</w:t></w:r></w:p>
            <w:p><w:r><w:t xml:space="preserve">Sam </w:t></w:r><w:r><w:t>Example &amp; Co</w:t></w:r></w:p>
            <w:tbl><w:tr><w:tc><w:p><w:r><w:t>2019</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Engineer</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
            <w:p><w:r><w:br w:type="page"/><w:t>Page two</w:t></w:r></w:p>
        </w:body></w:document>"#;
        let pages = text_of(xml);
        assert_eq!(pages.len(), 2);
        assert!(pages[0].starts_with("Curriculum Vitae\nSam Example & Co\n2019"));
        assert!(pages[0].contains("Engineer"));
        assert_eq!(pages[1], "Page two");
    }

    #[test]
    fn refuses_what_is_not_a_word_file() {
        assert!(read(b"not a zip".to_vec()).is_err());
    }
}
