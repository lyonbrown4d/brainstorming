use super::{ContentSearchResult, Result, SearchContent, SearchService, database_error};
use sqlx::{QueryBuilder, Row, Sqlite};

impl SearchService {
    pub async fn search(&self, input: SearchContent) -> Result<Vec<ContentSearchResult>> {
        if input.query.chars().count() > 256 || input.query.contains('\0') {
            return Err("搜索词须为不超过 256 个字符的文本".into());
        }
        let limit = input.limit.unwrap_or(30);
        if !(1..=100).contains(&limit) {
            return Err("搜索结果数量须为 1 至 100".into());
        }
        let terms: Vec<String> = input
            .query
            .split_whitespace()
            .map(str::to_lowercase)
            .collect();
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        let _operation = self.operations.lock().await;
        let long: Vec<&str> = terms
            .iter()
            .filter(|term| term.chars().count() >= 3)
            .map(String::as_str)
            .collect();
        let short: Vec<&str> = terms
            .iter()
            .filter(|term| term.chars().count() < 3)
            .map(String::as_str)
            .collect();
        let mut query = QueryBuilder::<Sqlite>::new(
            "SELECT workbook_id, substr(workbooks.title, 1, 241) AS workbook_title, sheet_id, sheet_name, topic_id, content_index.title, notes FROM content_index JOIN workbooks ON workbooks.id = workbook_id WHERE ",
        );
        if long.is_empty() {
            query.push("1 = 1");
        } else {
            // Every user term is an escaped FTS phrase. AND/quotes/operators are literal text.
            let expression = long
                .iter()
                .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(" AND ");
            query.push("content_index MATCH ").push_bind(expression);
        }
        for term in &short {
            query
                .push(" AND (instr(title_fold, ")
                .push_bind(*term)
                .push(") > 0 OR instr(notes_fold, ")
                .push_bind(*term)
                .push(") > 0)");
        }
        if long.is_empty() {
            query.push(" ORDER BY (");
            let mut score = query.separated(" + ");
            for term in &short {
                score
                    .push("CASE WHEN instr(title_fold, ")
                    .push_bind_unseparated(*term)
                    .push_unseparated(") > 0 THEN 10 ELSE 0 END");
            }
            query.push(") DESC");
        } else {
            query.push(" ORDER BY bm25(content_index, 0, 0, 0, 0, 10, 1, 0, 0)");
        }
        query
            .push(", workbook_id, sheet_id, topic_id LIMIT ")
            .push_bind(limit);
        let rows = query
            .build()
            .fetch_all(&self.pool)
            .await
            .map_err(database_error)?;
        Ok(rows
            .into_iter()
            .map(|row| {
                let title: String = row.get("title");
                let notes: String = row.get("notes");
                let notes_fold = notes.to_lowercase();
                let source = if terms.iter().any(|term| notes_fold.contains(term)) {
                    notes.as_str()
                } else {
                    title.as_str()
                };
                ContentSearchResult {
                    workbook_id: row.get("workbook_id"),
                    workbook_title: label(row.get("workbook_title")),
                    sheet_id: row.get("sheet_id"),
                    sheet_name: row.get("sheet_name"),
                    topic_id: row.get("topic_id"),
                    snippet: excerpt(source, &terms),
                    title: label(&title),
                }
            })
            .collect())
    }
}
fn excerpt(text: &str, terms: &[String]) -> String {
    // Work in character offsets so an excerpt never cuts a UTF-8 code point.
    let folded = text.to_lowercase();
    let found = terms
        .iter()
        .filter_map(|term| folded.find(term))
        .min()
        .unwrap_or(0);
    let (mut folded_bytes, mut original_characters) = (0, 0usize);
    for character in text.chars() {
        if folded_bytes >= found {
            break;
        }
        folded_bytes += character.to_lowercase().map(char::len_utf8).sum::<usize>();
        original_characters += 1;
    }
    let offset = original_characters.saturating_sub(40);
    let mut characters = text.chars().skip(offset);
    let body: String = characters.by_ref().take(160).collect();
    format!(
        "{}{}{}",
        if offset > 0 { "…" } else { "" },
        body,
        if characters.next().is_some() {
            "…"
        } else {
            ""
        }
    )
}

fn label(text: &str) -> String {
    let mut characters = text.chars();
    let mut result: String = characters.by_ref().take(240).collect();
    if characters.next().is_some() {
        result.pop();
        result.push('…');
    }
    result
}
