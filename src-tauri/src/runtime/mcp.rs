use super::{input::Result, mcp_validation};
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, oneshot};
use tokio_util::sync::CancellationToken;

pub struct Active {
  pub connection: Value,
  pub cancel: CancellationToken,
  pub pending: Mutex<HashMap<String, oneshot::Sender<Result<Value>>>>,
}
#[derive(Default)]
pub struct MCPService {
  active: Mutex<Option<Arc<Active>>>,
}
impl MCPService {
  pub async fn connection(&self) -> Value {
    self
      .active
      .lock()
      .await
      .as_ref()
      .map(|a| a.connection.clone())
      .unwrap_or(Value::Null)
  }
  pub async fn start(&self, app: &AppHandle, input: &Value) -> Result<Value> {
    let grant = mcp_validation::grant(input)?;
    let mut slot = self.active.lock().await;
    if slot.is_some() {
      return Err("MCP 已启用或正在切换，请先停止连接".into());
    }
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
      .await
      .map_err(|_| "无法启动本机 MCP 服务")?;
    let port = listener
      .local_addr()
      .map_err(|_| "无法读取 MCP 端口")?
      .port();
    let token = format!(
      "{}{}",
      uuid::Uuid::new_v4().simple(),
      uuid::Uuid::new_v4().simple()
    );
    let mut connection = grant;
    connection["sessionId"] = json!(uuid::Uuid::new_v4().to_string());
    connection["endpoint"] = json!(format!("http://127.0.0.1:{port}/mcp"));
    connection["token"] = json!(token);
    let active = Arc::new(Active {
      connection: connection.clone(),
      cancel: CancellationToken::new(),
      pending: Mutex::new(HashMap::new()),
    });
    let router = super::mcp_transport::router(app.clone(), active.clone());
    let shutdown = active.cancel.clone();
    tauri::async_runtime::spawn(async move {
      let _ = axum::serve(listener, router)
        .with_graceful_shutdown(shutdown.cancelled_owned())
        .await;
    });
    *slot = Some(active);
    if app
      .emit_to("main", "native:mcp-connection", &connection)
      .is_err()
    {
      if let Some(active) = slot.take() {
        active.cancel.cancel();
      }
      return Err("无法通知编辑器".into());
    }
    Ok(connection)
  }
  pub async fn shutdown(&self) {
    if let Some(active) = self.active.lock().await.take() {
      active.cancel.cancel();
      active.pending.lock().await.clear();
    }
  }
  pub async fn stop(&self, app: &AppHandle) {
    self.shutdown().await;
    let _ = app.emit_to("main", "native:mcp-connection", Value::Null);
  }
  pub async fn reply(&self, value: &Value) -> Result<()> {
    if value.to_string().len() > 256 * 1024 {
      return Err("读取结果过大，请减少 limit 或选择较小分支".into());
    }
    let Some(id) = value["id"].as_str() else {
      return Ok(());
    };
    let active = self.active.lock().await.clone();
    let Some(active) = active else {
      return Ok(());
    };
    let sender = active.pending.lock().await.remove(id);
    if let Some(sender) = sender {
      let result = if value["ok"] == true && value["data"].is_object() {
        Ok(value["data"].clone())
      } else {
        Err(
          value["error"]
            .as_str()
            .unwrap_or("Brainstorming 请求失败")
            .chars()
            .take(300)
            .collect(),
        )
      };
      let _ = sender.send(result);
    }
    Ok(())
  }
}
pub async fn request(
  app: &AppHandle,
  active: &Active,
  action: Value,
  cancel: &CancellationToken,
) -> Result<Value> {
  if active.cancel.is_cancelled() || cancel.is_cancelled() {
    return Err("Brainstorming 共享已停止".into());
  }
  let id = uuid::Uuid::new_v4().to_string();
  let (sender, receiver) = oneshot::channel();
  {
    let mut pending = active.pending.lock().await;
    if pending.len() >= 4 {
      return Err("Brainstorming 请求繁忙，请稍后重试".into());
    }
    pending.insert(id.clone(), sender);
  }
  let connection = &active.connection;
  let event = json!({"id":id,"sessionId":connection["sessionId"],"grant":{"workbookId":connection["workbookId"],"includeNotes":connection["includeNotes"],"allowProposals":connection["allowProposals"]},"action":action});
  if app.emit_to("main", "native:mcp-request", event).is_err() {
    active.pending.lock().await.remove(&id);
    return Err("Brainstorming 编辑器未连接".into());
  }
  let reply = tokio::select! {
      _ = active.cancel.cancelled() => Err("Brainstorming 共享已停止".into()),
      _ = cancel.cancelled() => Err("Brainstorming 请求已取消".into()),
      result = tokio::time::timeout(Duration::from_secs(10), receiver) => {
          match result {
              Ok(Ok(reply)) => reply,
              Ok(Err(_)) => Err("Brainstorming 共享已停止".into()),
              Err(_) => Err("Brainstorming 编辑器响应超时".into()),
          }
      }
  };
  active.pending.lock().await.remove(&id);
  reply
}
