use super::{mcp::Active, mcp_tools::BrainstormingTools};
use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::never::NeverSessionManager,
};
use std::sync::Arc;
use subtle::ConstantTimeEq;
use tauri::AppHandle;

#[derive(Clone)]
struct Guard {
    bearer: Arc<Vec<u8>>,
    permits: Arc<tokio::sync::Semaphore>,
}
pub fn router(app: AppHandle, active: Arc<Active>) -> Router {
    let mut config = StreamableHttpServerConfig::default();
    config.legacy_session_mode = false;
    config.json_response = true;
    config.max_request_body_bytes = 128 * 1024;
    config.allowed_hosts = vec!["127.0.0.1".into()];
    config.allowed_origins = vec![];
    config.cancellation_token = active.cancel.clone();
    let guard = Guard {
        bearer: Arc::new(
            format!(
                "Bearer {}",
                active.connection["token"].as_str().unwrap_or("")
            )
            .into_bytes(),
        ),
        permits: Arc::new(tokio::sync::Semaphore::new(8)),
    };
    let service = StreamableHttpService::new(
        move || {
            Ok(BrainstormingTools {
                app: app.clone(),
                active: active.clone(),
            })
        },
        Arc::new(NeverSessionManager::default()),
        config,
    );
    Router::new()
        .route_service("/mcp", service)
        .layer(middleware::from_fn_with_state(guard, authenticate))
}
async fn authenticate(State(guard): State<Guard>, request: Request<Body>, next: Next) -> Response {
    let supplied = request
        .headers()
        .get("authorization")
        .map(|v| v.as_bytes())
        .unwrap_or(&[]);
    if !bool::from(supplied.ct_eq(guard.bearer.as_slice())) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    // A browser origin cannot use the local bridge, even if it somehow acquires the token.
    if request.headers().contains_key("origin") {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(_permit) = guard.permits.try_acquire() else {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    };
    let mut response =
        match tokio::time::timeout(std::time::Duration::from_secs(11), next.run(request)).await {
            Ok(response) => response,
            Err(_) => return StatusCode::GATEWAY_TIMEOUT.into_response(),
        };
    response
        .headers_mut()
        .insert("cache-control", "no-store".parse().unwrap());
    response
}

#[cfg(test)]
#[path = "mcp_http_tests.rs"]
mod tests;
