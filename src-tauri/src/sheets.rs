//! Spreadsheets (.xlsx, .xls, .ods) read on this Mac: each sheet's cells as text, for reading, search and the viewer.

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use serde::Serialize;
use std::io::Cursor;

/// Rows kept per sheet; a sheet longer than this is cut, so one huge export can't swamp the library.
const MAX_ROWS: usize = 2000;

#[derive(Serialize)]
pub struct Sheet {
    pub name: String,
    pub rows: Vec<Vec<String>>,
    /// More rows than MAX_ROWS were left out.
    pub cut: bool,
}

fn cell(d: &Data) -> String {
    match d {
        // Dates as YYYY-MM-DD (with the time only when there is one), not Excel's day numbers.
        Data::DateTime(dt) => match dt.as_datetime() {
            Some(t) if t.time() == chrono::NaiveTime::MIN => t.format("%Y-%m-%d").to_string(),
            Some(t) => t.format("%Y-%m-%d %H:%M").to_string(),
            None => d.to_string(),
        },
        Data::Float(f) if f.fract() == 0.0 && f.abs() < 1e15 => format!("{}", *f as i64),
        Data::Float(f) => format!("{}", (f * 1e6).round() / 1e6),
        _ => d.to_string().trim().to_string(),
    }
}

/// Every sheet with its non-empty rows; empty sheets are left out and trailing empty cells trimmed.
pub fn read(bytes: Vec<u8>) -> Result<Vec<Sheet>, String> {
    let mut book = open_workbook_auto_from_rs(Cursor::new(bytes)).map_err(|e| format!("This spreadsheet could not be opened: {e}"))?;
    let mut sheets = Vec::new();
    for name in book.sheet_names() {
        let Ok(range) = book.worksheet_range(&name) else { continue };
        let mut rows = Vec::new();
        let mut cut = false;
        for row in range.rows() {
            let mut cells: Vec<String> = row.iter().map(cell).collect();
            while cells.last().is_some_and(|c| c.is_empty()) {
                cells.pop();
            }
            if cells.is_empty() {
                continue;
            }
            if rows.len() == MAX_ROWS {
                cut = true;
                break;
            }
            rows.push(cells);
        }
        if !rows.is_empty() {
            sheets.push(Sheet { name, rows, cut });
        }
    }
    Ok(sheets)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_cells_plainly() {
        assert_eq!(cell(&Data::Float(1500.0)), "1500");
        assert_eq!(cell(&Data::Float(0.125)), "0.125");
        assert_eq!(cell(&Data::Float(1.0 / 3.0)), "0.333333");
        assert_eq!(cell(&Data::String(" Vesting ".into())), "Vesting");
        assert_eq!(cell(&Data::Empty), "");
    }

    #[test]
    fn reads_sheets_skipping_empty_rows_and_sheets() {
        let sheets = read(include_bytes!("../testdata/sample.xlsx").to_vec()).unwrap();
        assert_eq!(sheets.len(), 1);
        assert_eq!(sheets[0].name, "Grants");
        assert_eq!(sheets[0].rows, vec![vec!["Grant", "Shares", "Strike"], vec!["Example grant", "1200", "0.25"], vec!["Total", "1200"]]);
        assert!(!sheets[0].cut);
    }

    #[test]
    fn refuses_a_file_that_is_not_a_spreadsheet() {
        assert!(read(b"not a spreadsheet".to_vec()).is_err());
    }
}
