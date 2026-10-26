mod bootstrap;
#[cfg(desktop)]
mod cef_runtime;
pub(crate) mod compute;
pub(crate) mod export_capture;
pub(crate) mod export_commands;
mod export_pipeline;
#[cfg(feature = "e2e")]
pub(crate) mod fixtures;
pub(crate) mod initialization;
mod logging;
mod menu;
pub(crate) mod menu_actions;
#[cfg(feature = "e2e")]
mod menu_snapshot;
mod plugins;
pub(crate) mod request;
pub use bootstrap::run;
pub(crate) use plugins::{restore_window_state, save_window_state};

pub(crate) mod window_commands;
pub(crate) mod wire;

pub(crate) use initialization::exit;

pub(crate) use menu::{install as install_menu, sync as sync_menu};
