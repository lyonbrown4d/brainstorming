use super::{Result, error::invalid};
use rusqlite::Connection;

pub const APPLICATION_ID: i64 = 0x42524e54;
pub const PROTOCOL_VERSION: i64 = 2;
const INITIAL: &str = include_str!("migrations/001_document.sql");

pub(crate) fn initialize(db: &mut Connection, create: bool) -> Result<()> {
    let application: i64 = db.pragma_query_value(None, "application_id", |r| r.get(0))?;
    let version: i64 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if application == 0 && version == 0 && create {
        let tables: i64 = db.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table'",
            [],
            |r| r.get(0),
        )?;
        if tables != 0 {
            return Err(invalid("不能覆盖非 Brainstorming 数据库"));
        }
        let tx = db.transaction()?;
        tx.execute_batch(INITIAL)?;
        tx.pragma_update(None, "application_id", APPLICATION_ID)?;
        tx.pragma_update(None, "user_version", PROTOCOL_VERSION)?;
        tx.commit()?;
    } else if application != APPLICATION_ID || version != PROTOCOL_VERSION {
        return Err(invalid(
            "不支持此原生文件版本；Tauri 原生协议为 2，旧协议请使用原版本导出",
        ));
    }
    Ok(())
}

pub(crate) fn configure(db: &Connection, password: Option<&str>) -> Result<()> {
    if let Some(password) = password.filter(|p| !p.is_empty()) {
        db.pragma_update(None, "key", password)?;
    }
    db.busy_timeout(std::time::Duration::from_secs(10))?;
    db.set_limit(rusqlite::limits::Limit::SQLITE_LIMIT_LENGTH, 134_217_728)?;
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA secure_delete=ON; PRAGMA synchronous=FULL;")?;
    let _: i64 = db.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get(0))?;
    Ok(())
}
