//! Several documents saved as one .zip, each under its original file name, at a place the user picked.

use std::collections::HashSet;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// "scan.pdf" twice becomes "scan.pdf" and "scan (2).pdf".
fn unique(name: &str, taken: &mut HashSet<String>) -> String {
    let path = Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
    let ext = path.extension().and_then(|s| s.to_str()).map(|e| format!(".{e}")).unwrap_or_default();
    let mut candidate = name.to_string();
    let mut n = 2;
    while !taken.insert(candidate.to_lowercase()) {
        candidate = format!("{stem} ({n}){ext}");
        n += 1;
    }
    candidate
}

/// Writes `files` (name in the zip, contents) into a new zip at `to`.
pub fn write(to: &str, files: Vec<(String, Vec<u8>)>) -> Result<(), String> {
    if !to.to_lowercase().ends_with(".zip") {
        return Err("The file must end in .zip.".into());
    }
    if files.is_empty() {
        return Err("There are no documents to put in the zip.".into());
    }
    let mut zip = ZipWriter::new(File::create(to).map_err(|e| e.to_string())?);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut taken = HashSet::new();
    for (name, bytes) in files {
        zip.start_file(unique(&name, &mut taken), options).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn zips_files_under_unique_names() {
        let dir = std::env::temp_dir().join(format!("voidcat-zip-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("papers.zip");
        let p = |x: &std::path::PathBuf| x.to_string_lossy().to_string();
        write(&p(&out), vec![("scan.pdf".into(), b"first".to_vec()), ("Scan.pdf".into(), b"second".to_vec())]).unwrap();

        let mut zip = zip::ZipArchive::new(File::open(&out).unwrap()).unwrap();
        let names: Vec<String> = zip.file_names().map(String::from).collect();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"scan.pdf".to_string()) && names.contains(&"Scan (2).pdf".to_string()));
        let mut text = String::new();
        zip.by_name("Scan (2).pdf").unwrap().read_to_string(&mut text).unwrap();
        assert_eq!(text, "second");
        assert!(write(&p(&dir.join("papers.txt")), vec![]).is_err());
    }
}
