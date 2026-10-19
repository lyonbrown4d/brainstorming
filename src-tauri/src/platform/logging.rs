use tauri_plugin_log::{RotationStrategy, Target, TargetKind, log::LevelFilter};

// Both native diagnostics and retained files accept only reviewed application events.
// In particular, dependency messages may contain URLs, SQL, or other private data.
fn application_target(target: &str) -> bool {
    target == "brainstorming_native" || target.starts_with("brainstorming_native::")
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let targets = vec![Target::new(TargetKind::Stderr)];
    // Native acceptance must not create logs in the developer's app directories.
    #[cfg(not(feature = "e2e"))]
    let targets = {
        let mut targets = targets;
        targets.push(Target::new(TargetKind::LogDir {
            file_name: Some("native".into()),
        }));
        targets
    };
    tauri_plugin_log::Builder::new()
        .level(LevelFilter::Warn)
        .filter(|metadata| application_target(metadata.target()))
        .targets(targets)
        .max_file_size(1_048_576)
        .rotation_strategy(RotationStrategy::KeepSome(3))
        .build()
}

#[cfg(test)]
mod tests {
    use super::application_target;

    #[test]
    fn persisted_logs_accept_only_application_targets() {
        assert!(application_target("brainstorming_native"));
        assert!(application_target(
            "brainstorming_native::document::creation"
        ));
        for target in ["sqlx", "reqwest", "webview", "brainstorming_native_remote"] {
            assert!(!application_target(target), "unexpected target: {target}");
        }
    }

    #[test]
    fn existing_tracing_events_reach_the_single_log_backend_once() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use tauri_plugin_log::log;
        struct BridgeLog(AtomicUsize);
        impl log::Log for BridgeLog {
            fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
                metadata.target() == "brainstorming_native::logging_bridge_test"
            }
            fn log(&self, record: &log::Record<'_>) {
                if self.enabled(record.metadata()) {
                    assert_eq!(record.args().to_string(), "Native logging bridge check");
                    self.0.fetch_add(1, Ordering::SeqCst);
                }
            }
            fn flush(&self) {}
        }
        static LOGGER: BridgeLog = BridgeLog(AtomicUsize::new(0));
        log::set_logger(&LOGGER).expect("test process must have only one logger");
        log::set_max_level(log::LevelFilter::Warn);
        tracing::warn!(target: "brainstorming_native::logging_bridge_test", "Native logging bridge check");
        assert_eq!(LOGGER.0.load(Ordering::SeqCst), 1);
    }
}
