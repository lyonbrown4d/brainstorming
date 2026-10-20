use super::{AppState, atomic, dialogs, input, native_files};
use crate::platform::compute::{FormatInput, SceneInput, SheetScene};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub async fn hydrate(app: &AppHandle, workbook: Value, original: bool) -> Result<Value, String> {
  crate::document::validate_workbook(&workbook).map_err(|e| e.to_string())?;
  let stored = workbook["sheets"]
    .as_array()
    .into_iter()
    .flatten()
    .any(|sheet| {
      sheet["document"]["assets"]
        .as_object()
        .into_iter()
        .flat_map(|assets| assets.values())
        .any(|asset| asset.get("storage").is_some())
    });
  if !stored {
    return Ok(workbook);
  }
  let media = app
    .try_state::<Arc<crate::media::MediaState>>()
    .ok_or("媒体服务尚未就绪")?;
  media.hydrate_workbook(workbook, original).await
}
pub async fn render(state: &AppState, input: SceneInput) -> Result<SheetScene, String> {
  // Stored resources are hydrated by the command after native authorization.
  let scene = state
    .compute
    .render(
      input.workbook,
      input.sheet_id,
      input.include_collapsed,
      input.geometry,
    )
    .await?;
  Ok(SheetScene {
    svg: scene.svg.clone(),
    width: scene.width,
    height: scene.height,
  })
}
pub async fn export(
  app: &AppHandle,
  state: &AppState,
  input: FormatInput,
) -> Result<Option<String>, String> {
  if !["md", "opml", "txt", "xmind"].contains(&input.format.as_str()) {
    return Err("导出格式无效".into());
  }
  let workbook = state
    .compute
    .run(move || {
      crate::document::validate_workbook(&input.workbook).map_err(|e| e.to_string())?;
      crate::interchange::select_sheets(&input.workbook, input.sheet_id.as_deref())
    })
    .await?;
  let suggested = format!(
    "{}.{}",
    input::safe_name(workbook["title"].as_str().unwrap_or("Brainstorming")),
    input.format
  );
  #[cfg(not(target_os = "ios"))]
  let Some(path) = dialogs::save(app, &suggested, &input.format).await? else {
    return Ok(None);
  };
  // Text formats do not read binary resources; current-sheet exports never load other sheets.
  let workbook = if input.format == "xmind" {
    hydrate(app, workbook, true).await?
  } else {
    workbook
  };
  let format = input.format.clone();
  let exported = state
    .compute
    .run(move || crate::interchange::export(&workbook, &format, None))
    .await?;
  #[cfg(not(target_os = "ios"))]
  {
    atomic::write(&path, &exported.bytes).await?;
    native_files::commit(app, &path).await?;
    Ok(Some(path.to_string_lossy().into_owned()))
  }
  #[cfg(target_os = "ios")]
  {
    super::ios_save::export(
      app,
      &exported.bytes,
      &exported.suggested_name,
      &input.format,
    )
    .await
    .map(|value| value.as_str().map(str::to_owned))
  }
}
