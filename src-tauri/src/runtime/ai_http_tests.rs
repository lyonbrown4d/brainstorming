use super::*;
use axum::{
    Json, Router,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::post,
};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

async fn server(router: Router) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();
    let handle = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    (format!("http://{address}"), handle)
}
fn settings() -> Value {
    json!({"model":"native-test-model","structuredOutputs":true})
}
fn request() -> Value {
    json!({"mode":"expand","prompt":"中文请求","context":[]})
}

#[tokio::test]
async fn real_http_preserves_authorization_structure_and_validates_tree() {
    let router = Router::new().route("/chat/completions", post(|headers: HeaderMap, Json(body): Json<Value>| async move {
        assert_eq!(headers["authorization"], "Bearer example-secret");
        assert_eq!(body["model"], "native-test-model");
        assert_eq!(body["response_format"]["type"], "json_schema");
        assert!(body["messages"][1]["content"].as_str().unwrap().contains("中文请求"));
        Json(json!({"choices":[{"message":{"content":"{\"title\":\"原生主题\",\"children\":[]}"}}],"usage":{"prompt_tokens":7,"completion_tokens":9}}))
    }));
    let (endpoint, server) = server(router).await;
    let result = generate(&endpoint, &settings(), "example-secret", &request())
        .await
        .unwrap();
    assert_eq!(result["tree"]["title"], "原生主题");
    assert_eq!(result["topicCount"], 1);
    assert_eq!(result["inputTokens"], 7);
    server.abort();
}

#[tokio::test]
async fn real_http_never_follows_redirects_and_bounds_untrusted_errors() {
    let reached = Arc::new(AtomicUsize::new(0));
    let target = reached.clone();
    let router = Router::new()
        .route(
            "/redirect/chat/completions",
            post(|| async {
                (StatusCode::TEMPORARY_REDIRECT, [("location", "/capture")]).into_response()
            }),
        )
        .route(
            "/capture",
            post(move || async move {
                target.fetch_add(1, Ordering::SeqCst);
                "redirect target"
            }),
        )
        .route(
            "/large/chat/completions",
            post(|| async { "x".repeat(MAX_RESPONSE + 1) }),
        )
        .route(
            "/error/chat/completions",
            post(|| async {
                (
                    StatusCode::UNAUTHORIZED,
                    "example-secret server diagnostics",
                )
            }),
        );
    let (endpoint, server) = server(router).await;
    for path in ["redirect", "large", "error"] {
        let error = generate(
            &format!("{endpoint}/{path}"),
            &settings(),
            "example-secret",
            &request(),
        )
        .await
        .unwrap_err();
        assert!(!error.contains("example-secret"));
        assert!(!error.contains("server diagnostics"));
    }
    assert_eq!(reached.load(Ordering::SeqCst), 0);
    server.abort();
}
