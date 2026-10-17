use super::*;
use axum::{body::to_bytes, http::Request, routing::post};
use tower::ServiceExt;

fn guarded() -> Router {
    let guard = Guard {
        bearer: Arc::new(b"Bearer example-token".to_vec()),
        permits: Arc::new(tokio::sync::Semaphore::new(8)),
    };
    Router::new()
        .route("/mcp", post(|| async { "allowed" }))
        .layer(middleware::from_fn_with_state(guard, authenticate))
}
#[tokio::test]
async fn http_guard_rejects_missing_wrong_and_browser_credentials() {
    for (authorization, origin, expected) in [
        (None, None, StatusCode::UNAUTHORIZED),
        (Some("Bearer wrong"), None, StatusCode::UNAUTHORIZED),
        (
            Some("Bearer example-token"),
            Some("https://attacker.test"),
            StatusCode::FORBIDDEN,
        ),
        (
            Some("Bearer example-token"),
            Some("null"),
            StatusCode::FORBIDDEN,
        ),
        (Some("Bearer example-token"), None, StatusCode::OK),
    ] {
        let mut request = Request::builder().method("POST").uri("/mcp");
        if let Some(value) = authorization {
            request = request.header("authorization", value);
        }
        if let Some(value) = origin {
            request = request.header("origin", value);
        }
        let response = guarded()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        if expected == StatusCode::OK {
            assert_eq!(response.headers()["cache-control"], "no-store");
            assert_eq!(
                to_bytes(response.into_body(), 100).await.unwrap(),
                "allowed"
            );
        }
    }
}
