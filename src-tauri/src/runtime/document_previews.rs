use super::{
  input::{self, Result},
  state::AppState,
};
use crate::document::{MAX_PREVIEW_BYTES, MAX_TOTAL_PREVIEW_BYTES, SheetPreview};
use serde_json::{Value, json};

pub async fn revision(state: &AppState, args: &Value) -> Result<Value> {
  let id = input::text(args, "documentId", 4096)?;
  input::identifier(id)?;
  let workbook = input::workbook(input::text(args, "contents", input::MAX_DOCUMENT)?)?;
  if input::workbook_id(&workbook)? != id {
    return Err("预览工作簿不一致".into());
  }
  let session = state.session.lock().await;
  if session.closing {
    return Ok(Value::Null);
  }
  let Some(path) = session
    .sources
    .get(id)
    .filter(|p| session.retained.contains(*p) && session.authorized.contains(*p))
  else {
    return Ok(Value::Null);
  };
  if session.password_for(id).is_some() {
    return Ok(Value::Null);
  }
  state
    .documents
    .preview_revision(path, &workbook, None)
    .await
    .map(|revision| json!(revision))
    .map_err(|e| e.to_string())
}

pub async fn write(state: &AppState, args: &Value) -> Result<Value> {
  let id = input::text(args, "documentId", 4096)?;
  input::identifier(id)?;
  let revision = input::text(args, "revision", 64)?.to_string();
  let cover = input::text(args, "coverSheetId", 4096)?.to_string();
  let sheets = input::required(args, "sheets")?
    .as_array()
    .filter(|s| !s.is_empty() && s.len() <= 128)
    .ok_or("预览画布数量无效")?;
  // Bound the complete payload before converting JSON bytes or decoding PNGs.
  let mut total = 0usize;
  for sheet in sheets {
    let length = input::required(sheet, "png")?
      .as_array()
      .ok_or("预览 PNG 无效")?
      .len();
    total = total.checked_add(length).ok_or("文档预览超过限制")?;
    if length > MAX_PREVIEW_BYTES || total > MAX_TOTAL_PREVIEW_BYTES {
      return Err("文档预览超过限制".into());
    }
  }
  let mut previews = Vec::with_capacity(sheets.len());
  for sheet in sheets {
    previews.push(SheetPreview {
      sheet_id: input::text(sheet, "sheetId", 4096)?.to_string(),
      png: input::bytes(input::required(sheet, "png")?, MAX_PREVIEW_BYTES)?,
    });
  }
  // Hold the existing session gate through the bounded write: close/rekey either
  // wins before this check or waits until this already-started update completes.
  let session = state.session.lock().await;
  if session.closing {
    return Ok(json!(false));
  }
  let Some(path) = session
    .sources
    .get(id)
    .filter(|p| session.retained.contains(*p) && session.authorized.contains(*p))
  else {
    return Ok(json!(false));
  };
  if session.password_for(id).is_some() {
    return Ok(json!(false));
  }
  state
    .documents
    .write_previews(path, revision, cover, previews, None)
    .await
    .map(|written| json!(written))
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{application::Backend, document_fixture as fixture, runtime::documents};

  #[tokio::test]
  async fn preview_commands_require_a_live_selected_plaintext_document() {
    let directory = tempfile::tempdir().unwrap();
    let backend = Backend::start(directory.path().join("state"), None)
      .await
      .unwrap();
    let state = backend.state.clone();
    let path = directory.path().join("selected.brainstorming");
    let contents = fixture::workbook().to_string();
    let args = json!({"documentId":"workbook","contents":contents});
    assert!(revision(&state, &args).await.unwrap().is_null());
    assert!(!path.exists());
    state.session.lock().await.authorized.insert(path.clone());
    documents::save(&state, path.clone(), &json!({"contents":contents}))
      .await
      .unwrap();
    let saved_revision = revision(&state, &args).await.unwrap();
    assert!(saved_revision.as_str().is_some());
    let mut png = Vec::new();
    {
      let mut encoder = png::Encoder::new(&mut png, 1, 1);
      encoder.set_color(png::ColorType::Rgba);
      let mut writer = encoder.write_header().unwrap();
      writer.write_image_data(&[0, 0, 0, 255]).unwrap();
      writer.finish().unwrap();
    }
    let update = json!({"documentId":"workbook","revision":saved_revision,"coverSheetId":"sheet-a","sheets":[{"sheetId":"sheet-a","png":png}]});
    assert_eq!(write(&state, &update).await.unwrap(), json!(true));
    documents::set_password(&state, "workbook", Some("secret-password"))
      .await
      .unwrap();
    assert!(revision(&state, &args).await.unwrap().is_null());
    assert_eq!(write(&state, &update).await.unwrap(), json!(false));
    documents::set_password(&state, "workbook", None)
      .await
      .unwrap();
    state.session.lock().await.sources.remove("workbook");
    assert!(revision(&state, &args).await.unwrap().is_null());
    assert_eq!(write(&state, &update).await.unwrap(), json!(false));
    backend.shutdown().await.unwrap();
  }
}
