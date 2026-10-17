use axum::serve::Listener;
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tokio::{io::DuplexStream, net::TcpListener, sync::Semaphore};
use tokio_util::sync::CancellationToken;

/// Axum's graceful shutdown can wait indefinitely for an unread response. The
/// bounded Tokio bridge gives session revocation an immediate socket-close path.
pub(super) struct RevocableListener {
    listener: TcpListener,
    cancellation: CancellationToken,
    connections: Arc<Semaphore>,
}
impl RevocableListener {
    pub fn new(listener: TcpListener, cancellation: CancellationToken) -> Self {
        Self {
            listener,
            cancellation,
            connections: Arc::new(Semaphore::new(64)),
        }
    }
}
impl Listener for RevocableListener {
    type Io = DuplexStream;
    type Addr = SocketAddr;
    async fn accept(&mut self) -> (Self::Io, Self::Addr) {
        loop {
            let permit = self
                .connections
                .clone()
                .acquire_owned()
                .await
                .expect("private semaphore remains open");
            match self.listener.accept().await {
                Ok((mut socket, address)) => {
                    let (server, mut bridge) = tokio::io::duplex(64 * 1024);
                    let cancellation = self.cancellation.clone();
                    tokio::spawn(async move {
                        let _permit = permit;
                        tokio::select! { biased;
                            _=cancellation.cancelled()=>{},
                            _=tokio::io::copy_bidirectional(&mut socket,&mut bridge)=>{},
                        }
                        // Both endpoints drop here even if the peer stopped reading.
                    });
                    return (server, address);
                }
                Err(_) => tokio::time::sleep(Duration::from_millis(100)).await,
            }
        }
    }
    fn local_addr(&self) -> std::io::Result<Self::Addr> {
        self.listener.local_addr()
    }
}
