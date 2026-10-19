use thiserror::Error;

#[derive(Debug, Error)]
pub enum DocumentError {
  #[error("文档数据库无法读取或写入（密码错误、文件损坏或存储不可用）")]
  Database(#[from] sqlx::Error),
  #[error("数据库迁移失败（迁移履历或校验和无效）")]
  Migration(#[from] sqlx::migrate::MigrateError),
  #[error("文件操作失败：{0}")]
  Io(#[from] std::io::Error),
  #[error("文档 JSON 无效")]
  Json(#[from] serde_json::Error),
  #[error("{0}")]
  Invalid(String),
  #[error("数据库连接池不可用")]
  Pool,
  #[error("数据库操作线程失败")]
  Worker,
}

pub type Result<T> = std::result::Result<T, DocumentError>;
pub(crate) fn invalid(message: impl Into<String>) -> DocumentError {
  DocumentError::Invalid(message.into())
}
