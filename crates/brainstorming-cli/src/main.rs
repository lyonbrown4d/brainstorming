mod args;
mod export;
mod password;
use args::{Cli, Command};
use brainstorming_engine::{application::ExportApplication, document::DocumentSnapshot};
use clap::Parser;
use serde_json::{Value, json};
use std::{io::Write, process::ExitCode};

#[tokio::main]
async fn main() -> ExitCode {
  let args = Cli::parse();
  // Before registering SIGINT or opening resources, ordinary Ctrl+C cancels stdin.
  let password = match password::read(args.command.source().password_stdin) {
    Ok(value) => value,
    Err(error) => {
      eprintln!("brainstorming-cli: {error}");
      return ExitCode::FAILURE;
    }
  };
  let result = run(args, password.as_deref().map(|p| p.as_str())).await;
  match result {
    Ok(result) => match writeln!(std::io::stdout().lock(), "{result}") {
      Ok(()) => ExitCode::SUCCESS,
      Err(error) if error.kind() == std::io::ErrorKind::BrokenPipe => ExitCode::SUCCESS,
      Err(_) => ExitCode::FAILURE,
    },
    Err(error) => {
      eprintln!("brainstorming-cli: {error}");
      ExitCode::from(if error == "导出已取消" { 130 } else { 1 })
    }
  }
}
async fn run(args: Cli, password: Option<&str>) -> Result<Value, String> {
  let mut app = ExportApplication::start().await?;
  let result = {
    let operation = operation(&args.command, password, &app);
    tokio::pin!(operation);
    tokio::select! {
      result=&mut operation=>result,
      signal=tokio::signal::ctrl_c()=>{
        app.exports.begin_shutdown();
        let _=operation.await;
        match signal {Ok(())=>Err("导出已取消".into()),Err(_)=>Err("无法接收取消信号".into())}
      }
    }
  };
  let cleanup = app.shutdown().await;
  result.and_then(|value| cleanup.map(|()| value))
}
async fn operation(
  command: &Command,
  password: Option<&str>,
  app: &ExportApplication,
) -> Result<Value, String> {
  let snapshot = DocumentSnapshot::open(&command.source().input, password)
    .await
    .map_err(|e| e.to_string())?;
  let result = match command {
    Command::Export(args) => export::run(args, &snapshot, app).await,
    Command::Sheets(_) => Ok(
      json!({"sheets":snapshot.workbook()["sheets"].as_array().into_iter().flatten().map(|s|json!({"id":s["id"],"name":s["name"]})).collect::<Vec<_>>()}),
    ),
  };
  let cleanup = snapshot.close().await.map_err(|e| e.to_string());
  result.and_then(|value| cleanup.map(|()| value))
}
