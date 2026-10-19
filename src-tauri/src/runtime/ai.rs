use super::{
  ai_validation, atomic,
  input::{Result, text},
  secrets,
};
use serde_json::{Value, json};
use std::{collections::HashMap, path::PathBuf, time::Duration};
use tauri::AppHandle;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;

struct Configuration {
  settings: Value,
  key: Zeroizing<String>,
  persisted: bool,
  initialized: bool,
  credential_revision: String,
}
pub struct AIService {
  directory: PathBuf,
  configuration: Mutex<Configuration>,
  requests: Mutex<HashMap<String, CancellationToken>>,
}
impl AIService {
  pub fn new(directory: PathBuf) -> Self {
    Self {
      directory,
      configuration: Mutex::new(Configuration {
        settings: json!({"baseURL":"https://api.openai.com/v1","model":"","rememberKey":true,"structuredOutputs":true}),
        key: Zeroizing::new(String::new()),
        persisted: false,
        initialized: false,
        credential_revision: String::new(),
      }),
      requests: Mutex::new(HashMap::new()),
    }
  }
  async fn initialize(&self, app: &AppHandle, configuration: &mut Configuration) -> Result<()> {
    if configuration.initialized {
      return Ok(());
    }
    let file = self.directory.join("ai-settings.json");
    match tokio::fs::read(&file).await {
      Ok(bytes) => {
        if bytes.len() > 16384 {
          return Err("AI 设置文件超过限制".into());
        }
        let stored: Value =
          serde_json::from_slice(&bytes).map_err(|_| "无法读取 AI 设置，请重新保存服务配置")?;
        ai_validation::settings(&stored["settings"])?;
        configuration.credential_revision = stored["credentialRevision"]
          .as_str()
          .unwrap_or("")
          .to_string();
        configuration.settings = stored["settings"].clone();
      }
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
      Err(_) => return Err("无法读取 AI 设置，请重新保存服务配置".into()),
    }
    if configuration.settings["rememberKey"] == true
      && let Some(key) = secrets::read(app).await
      && let Some(value) = restore_key(
        &key,
        &configuration.credential_revision,
        &configuration.settings["baseURL"],
      )
    {
      configuration.key = value;
      configuration.persisted = true;
    }
    configuration.initialized = true;
    Ok(())
  }
  fn view(configuration: &Configuration) -> Value {
    let mut view = configuration.settings.clone();
    view["hasKey"] = json!(!configuration.key.is_empty());
    view["keyStorage"] = json!(if configuration.key.is_empty() {
      "none"
    } else if configuration.persisted {
      "encrypted"
    } else {
      "memory"
    });
    view["notice"] = if !configuration.key.is_empty()
      && configuration.settings["rememberKey"] == true
      && !configuration.persisted
    {
      json!("系统安全存储不可用，密钥仅在本次运行保留；关闭应用后需重新输入。")
    } else {
      Value::Null
    };
    view
  }
  pub async fn get(&self, app: &AppHandle) -> Result<Value> {
    let mut config = self.configuration.lock().await;
    self.initialize(app, &mut config).await?;
    Ok(Self::view(&config))
  }
  pub async fn save(&self, app: &AppHandle, input: &Value) -> Result<Value> {
    ai_validation::settings(input)?;
    let mut config = self.configuration.lock().await;
    // Saving valid settings repairs a corrupt settings file without exposing its contents.
    let _ = self.initialize(app, &mut config).await;
    let endpoint = ai_validation::endpoint(text(input, "baseURL", 2048)?)?;
    let provided = input["apiKey"]
      .as_str()
      .map(str::trim)
      .filter(|s| !s.is_empty());
    let key = if input["clearKey"] == true {
      String::new()
    } else if let Some(key) = provided {
      key.to_string()
    } else if config.settings["baseURL"] == endpoint {
      config.key.to_string()
    } else {
      String::new()
    };
    let settings = json!({"baseURL":endpoint,"model":input["model"].as_str().unwrap_or("").trim(),"rememberKey":input["rememberKey"],"structuredOutputs":input["structuredOutputs"]});
    let remember = input["rememberKey"] == true;
    let revision = uuid::Uuid::new_v4().to_string();
    let credential = Zeroizing::new(
      json!({"revision":revision,"baseURL":settings["baseURL"],"key":key}).to_string(),
    );
    let stored = secrets::save(
      app,
      if remember && !key.is_empty() {
        &credential
      } else {
        ""
      },
    )
    .await;
    let persisted = stored && remember && !key.is_empty();
    // A new revision in the settings file prevents a stale OS credential from being
    // reused if secure storage is unavailable while changing endpoints or clearing keys.
    atomic::write(
      &self.directory.join("ai-settings.json"),
      json!({"settings":settings,"credentialRevision":revision})
        .to_string()
        .as_bytes(),
    )
    .await?;
    config.credential_revision = revision;
    config.settings = settings;
    config.key = Zeroizing::new(key);
    config.persisted = persisted;
    config.initialized = true;
    Ok(Self::view(&config))
  }
  pub async fn cancel(&self, id: &str) {
    if let Some(token) = self.requests.lock().await.get(id) {
      token.cancel();
    }
  }
  pub async fn cancel_all(&self) {
    for token in self.requests.lock().await.values() {
      token.cancel();
    }
  }
  pub async fn generate(&self, app: &AppHandle, request: &Value) -> Result<Value> {
    let id = ai_validation::request(request)?;
    let cancel = CancellationToken::new();
    {
      let mut requests = self.requests.lock().await;
      if requests.contains_key(&id) || requests.len() >= 4 {
        return Err("AI 请求正在运行".into());
      }
      requests.insert(id.clone(), cancel.clone());
    }
    let operation = async {
      let (settings, key) = {
        let mut config = self.configuration.lock().await;
        self.initialize(app, &mut config).await?;
        (
          config.settings.clone(),
          Zeroizing::new(config.key.to_string()),
        )
      };
      let endpoint = ai_validation::endpoint(settings["baseURL"].as_str().unwrap_or(""))?;
      if settings["model"].as_str().unwrap_or("").trim().is_empty() {
        return Err("请先配置 AI 模型名称".into());
      }
      if endpoint.starts_with("https:") && key.is_empty() {
        return Err("请先输入 API 密钥；本机 HTTP 服务可以留空".into());
      }
      super::ai_transport::generate(&endpoint, &settings, &key, request).await
    };
    let result = tokio::select! {
        _ = cancel.cancelled() => Err("AI 请求已取消".into()),
        result = tokio::time::timeout(Duration::from_secs(30), operation) => {
            result.unwrap_or_else(|_| Err("AI 请求超过 30 秒，请重试或减少内容".into()))
        }
    };
    self.requests.lock().await.remove(&id);
    result
  }
}

fn restore_key(stored: &str, revision: &str, endpoint: &Value) -> Option<Zeroizing<String>> {
  if stored.len() > 8192 || revision.is_empty() {
    return None;
  }
  let record: Value = serde_json::from_str(stored).ok()?;
  if record["revision"] != revision || &record["baseURL"] != endpoint {
    return None;
  }
  let key = record["key"].as_str()?;
  if key.is_empty() || key.len() > 4096 || key.chars().any(char::is_control) {
    return None;
  }
  Some(Zeroizing::new(key.to_string()))
}
#[cfg(test)]
#[path = "ai_tests.rs"]
mod tests;
