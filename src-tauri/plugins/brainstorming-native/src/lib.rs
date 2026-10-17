use serde_json::Value;
use tauri::{
    AppHandle, Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_brainstorming_native);

#[cfg(desktop)]
mod desktop_capture;
#[cfg(target_os = "macos")]
mod macos_chrome;

pub struct NativeBridge<R: Runtime> {
    #[cfg(mobile)]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(desktop)]
    app: AppHandle<R>,
}
impl<R: Runtime> NativeBridge<R> {
    pub async fn call(&self, command: &str, payload: Value) -> Result<Value, String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin_async(command, payload)
                .await
                .map_err(|_| "原生系统操作失败".to_string())
        }
        #[cfg(desktop)]
        {
            match command {
                #[cfg(target_os = "macos")]
                "getWindowChromeMetrics" => macos_chrome::metrics(&self.app).await,
                "captureLinkPreview" => desktop_capture::capture(&self.app, payload).await,
                "cancelLinkPreview" => desktop_capture::cancel(&self.app, payload).await,
                _ => Err("此命令仅用于原生移动系统适配".into()),
            }
        }
    }
}
pub trait NativeBridgeExt<R: Runtime> {
    fn native_bridge(&self) -> &NativeBridge<R>;
}
impl<R: Runtime, T: Manager<R>> NativeBridgeExt<R> for T {
    fn native_bridge(&self) -> &NativeBridge<R> {
        self.state::<NativeBridge<R>>().inner()
    }
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("brainstorming-native")
        .setup(|app: &AppHandle<R>, api| {
            #[cfg(target_os = "android")]
            let handle = api
                .register_android_plugin("com.brainstorming.nativebridge", "NativeBridgePlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_brainstorming_native)?;
            #[cfg(desktop)]
            let _ = api;
            app.manage(NativeBridge {
                #[cfg(mobile)]
                handle,
                #[cfg(desktop)]
                app: app.clone(),
            });
            Ok(())
        })
        .build()
}
