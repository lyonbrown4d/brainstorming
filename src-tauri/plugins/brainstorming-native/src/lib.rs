use serde_json::Value;
use tauri::{
  AppHandle, Manager,
  plugin::{Builder, TauriPlugin},
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_brainstorming_native);

#[cfg(desktop)]
mod capture_cef;
#[cfg(desktop)]
mod cef_commands;
#[cfg(desktop)]
mod desktop_capture;
#[cfg(all(feature = "e2e", desktop))]
mod e2e_pointer;
#[cfg(all(feature = "e2e", desktop))]
#[path = "e2e_pointer_cef.rs"]
mod e2e_pointer_native;
#[cfg(all(feature = "e2e", desktop))]
mod e2e_pointer_request;
#[cfg(all(feature = "e2e", desktop))]
mod e2e_wheel_cef;
#[cfg(target_os = "macos")]
mod macos_chrome;

pub struct NativeBridge {
  #[cfg(mobile)]
  handle: tauri::plugin::PluginHandle<tauri::DynRuntime>,
  #[cfg(desktop)]
  app: AppHandle,
}
impl NativeBridge {
  pub async fn call(&self, command: &str, payload: Value) -> Result<Value, String> {
    #[cfg(mobile)]
    {
      self
        .handle
        .run_mobile_plugin_async(command, payload)
        .await
        .map_err(|_| "原生系统操作失败".to_string())
    }
    #[cfg(desktop)]
    {
      match command {
        #[cfg(all(feature = "e2e", desktop))]
        "e2eNativeWheel" => e2e_wheel_cef::call(&self.app, payload).await,
        #[cfg(all(feature = "e2e", desktop))]
        "e2eNativePointer" => e2e_pointer::call(&self.app, payload).await,
        #[cfg(target_os = "macos")]
        "getWindowChromeMetrics" => macos_chrome::metrics(&self.app).await,
        "captureWindowView" => desktop_capture::capture_window(&self.app, payload).await,
        "captureLinkPreview" => desktop_capture::capture(&self.app, payload).await,
        "cancelLinkPreview" => desktop_capture::cancel(&self.app, payload).await,
        _ => Err("此命令仅用于原生移动系统适配".into()),
      }
    }
  }
}
pub trait NativeBridgeExt {
  fn native_bridge(&self) -> &NativeBridge;
}
impl<T: Manager<tauri::DynRuntime>> NativeBridgeExt for T {
  fn native_bridge(&self) -> &NativeBridge {
    self.state::<NativeBridge>().inner()
  }
}
pub fn init() -> TauriPlugin<tauri::DynRuntime> {
  Builder::new("brainstorming-native")
    .setup(|app: &AppHandle, api| {
      #[cfg(target_os = "android")]
      let handle =
        api.register_android_plugin("com.brainstorming.nativebridge", "NativeBridgePlugin")?;
      #[cfg(target_os = "ios")]
      let handle = api.register_ios_plugin(init_plugin_brainstorming_native)?;
      #[cfg(desktop)]
      {
        let _ = api;
        app.manage(std::sync::Arc::new(cef_commands::CefCommands::default()));
      }
      #[cfg(all(feature = "e2e", desktop))]
      app.manage(std::sync::Arc::new(e2e_pointer::Adapter::default()));
      app.manage(NativeBridge {
        #[cfg(mobile)]
        handle,
        #[cfg(desktop)]
        app: app.clone(),
      });
      Ok(())
    })
    .on_event(|app, event| {
      #[cfg(mobile)]
      let _ = (app, event);
      #[cfg(desktop)]
      if let tauri::RunEvent::WindowEvent {
        label,
        event: tauri::WindowEvent::Destroyed,
        ..
      } = event
      {
        let app = app.clone();
        let label = label.clone();
        tauri::async_runtime::spawn(async move {
          cef_commands::release(&app, &label).await;
        });
      }
    })
    .build()
}
