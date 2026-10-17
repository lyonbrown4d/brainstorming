use super::ResourceBackend;
use axum::body::Bytes;
use futures_util::{Stream, stream};
use std::{io, sync::Arc};
use tokio_util::sync::CancellationToken;
pub const CHUNK_BYTES: u64 = 256 * 1024;

/// Each poll issues at most one verified chunk read. Dropping the HTTP body
/// drops the current read future; no producer task buffers the rest of a video.
pub fn resource_stream(
    backend: Arc<dyn ResourceBackend>,
    id: String,
    offset: u64,
    length: u64,
    cancellation: CancellationToken,
) -> impl Stream<Item = io::Result<Bytes>> + Send + 'static {
    stream::try_unfold(
        (backend, id, offset, length, cancellation),
        |(backend, id, offset, remaining, cancellation)| async move {
            if remaining == 0 {
                return Ok(None);
            }
            let requested = remaining.min(CHUNK_BYTES);
            let bytes = tokio::select! {
                biased;
                _ = cancellation.cancelled() => return Err(io::Error::new(io::ErrorKind::Interrupted, "Resource session revoked")),
                bytes = backend.read(&id, offset, requested) => bytes.map_err(io::Error::other)?,
            };
            if bytes.len() as u64 != requested {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "Incomplete resource chunk",
                ));
            }
            Ok(Some((
                Bytes::from(bytes),
                (
                    backend,
                    id,
                    offset + requested,
                    remaining - requested,
                    cancellation,
                ),
            )))
        },
    )
}
