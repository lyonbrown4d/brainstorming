use super::{AppState, input};
use serde_json::{Value, json};

pub async fn sync(state: &AppState, args: &Value) -> input::Result<Value> {
  let input = serde_json::from_value(input::required(args, "input")?.clone())
    .map_err(|_| "搜索索引输入格式无效")?;
  state.search.sync(input).await?;
  Ok(Value::Null)
}
pub async fn search(state: &AppState, args: &Value) -> input::Result<Value> {
  let input = serde_json::from_value(input::required(args, "input")?.clone())
    .map_err(|_| "搜索输入格式无效")?;
  Ok(json!(state.search.search(input).await?))
}
