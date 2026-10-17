use super::{
    Result,
    resources::{self, ResourceReader},
};
use bytes::Bytes;
use futures_util::stream;
use sqlx::{Connection, Sqlite, SqliteConnection, Transaction};
use tokio::sync::OwnedRwLockReadGuard;
use tokio_util::io::StreamReader;

enum SnapshotDb {
    Standalone(SqliteConnection),
    Pooled(Transaction<'static, Sqlite>),
}
impl SnapshotDb {
    fn connection(&mut self) -> &mut SqliteConnection {
        match self {
            Self::Standalone(db) => db,
            Self::Pooled(tx) => tx,
        }
    }
    async fn finish(self) -> std::result::Result<(), sqlx::Error> {
        match self {
            Self::Standalone(db) => db.close().await,
            Self::Pooled(tx) => tx.rollback().await,
        }
    }
}
struct Snapshot {
    db: SnapshotDb,
    id: String,
    total: u64,
    offset: u64,
    // Vault shutdown waits for every borrowed stream, including cancelled reads.
    _lease: Option<OwnedRwLockReadGuard<()>>,
}

pub(crate) async fn standalone_reader(
    mut db: SqliteConnection,
    id: &str,
) -> Result<ResourceReader> {
    sqlx::query("BEGIN DEFERRED").execute(&mut db).await?;
    reader(SnapshotDb::Standalone(db), id, None).await
}
pub(crate) async fn pooled_reader(
    tx: Transaction<'static, Sqlite>,
    id: &str,
    lease: OwnedRwLockReadGuard<()>,
) -> Result<ResourceReader> {
    reader(SnapshotDb::Pooled(tx), id, Some(lease)).await
}
async fn reader(
    mut db: SnapshotDb,
    id: &str,
    lease: Option<OwnedRwLockReadGuard<()>>,
) -> Result<ResourceReader> {
    // Reading size establishes the snapshot before the stream is handed out.
    let total = resources::size(db.connection(), id).await?;
    let state = Snapshot {
        db,
        id: id.to_owned(),
        total,
        offset: 0,
        _lease: lease,
    };
    let chunks = stream::try_unfold(state, |mut state| async move {
        if state.offset >= state.total {
            state.db.finish().await.map_err(std::io::Error::other)?;
            return Ok(None);
        }
        let length = (state.total - state.offset).min(resources::RESOURCE_CHUNK_BYTES as u64);
        let chunk =
            resources::read_range(state.db.connection(), &state.id, state.offset, Some(length))
                .await
                .map_err(std::io::Error::other)?;
        state.offset += chunk.len() as u64;
        Ok::<_, std::io::Error>(Some((Bytes::from(chunk), state)))
    });
    Ok(Box::new(StreamReader::new(Box::pin(chunks))))
}
