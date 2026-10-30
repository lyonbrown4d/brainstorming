mod listener;
mod response;
mod stream;

use axum::{Router, routing::any};
pub use response::{ByteRange, parse_range};
use std::{future::Future, pin::Pin, sync::Arc};
pub use stream::resource_stream;
use tokio_util::sync::CancellationToken;

pub type Result<T> = std::result::Result<T, String>;
pub type ReadFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T>> + Send + 'a>>;
#[derive(Clone, Debug)]
pub struct ObjectInfo {
  pub byte_length: u64,
  pub mime_type: String,
}
pub trait ResourceBackend: Send + Sync + 'static {
  fn info<'a>(&'a self, id: &'a str) -> ReadFuture<'a, ObjectInfo>;
  fn read<'a>(&'a self, id: &'a str, offset: u64, length: u64) -> ReadFuture<'a, Vec<u8>>;
  fn tile<'a>(&'a self, id: &'a str, level: u32, x: u32, y: u32) -> ReadFuture<'a, Option<String>>;
}
#[derive(Clone)]
pub(crate) struct ServerState {
  pub backend: Arc<dyn ResourceBackend>,
  pub token: String,
  pub origin: String,
  pub authority: String,
  pub cancellation: CancellationToken,
}
pub struct ResourceServer {
  pub origin: String,
  cancellation: CancellationToken,
  task: tokio::task::JoinHandle<()>,
}
impl ResourceServer {
  pub async fn start(backend: Arc<dyn ResourceBackend>, app_origin: String) -> Result<Self> {
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
      .await
      .map_err(|e| e.to_string())?;
    let authority = listener
      .local_addr()
      .map_err(|e| e.to_string())?
      .to_string();
    let token = format!(
      "{}{}",
      uuid::Uuid::new_v4().simple(),
      uuid::Uuid::new_v4().simple()
    );
    let cancellation = CancellationToken::new();
    let state = ServerState {
      backend,
      token: token.clone(),
      origin: app_origin,
      authority: authority.clone(),
      cancellation: cancellation.clone(),
    };
    let router = Router::new()
      .fallback(any(response::handle))
      .with_state(state);
    let stopped = cancellation.clone();
    let task = tokio::spawn(async move {
      let _ = axum::serve(
        listener::RevocableListener::new(listener, stopped.clone()),
        router,
      )
      .with_graceful_shutdown(stopped.cancelled_owned())
      .await;
    });
    Ok(Self {
      origin: format!("http://{authority}/{token}"),
      cancellation,
      task,
    })
  }
  pub fn revoke(&self) {
    self.cancellation.cancel();
  }
  pub async fn shutdown(mut self) {
    self.cancellation.cancel();
    let _ = (&mut self.task).await;
  }
}

impl Drop for ResourceServer {
  fn drop(&mut self) {
    self.cancellation.cancel();
  }
}
