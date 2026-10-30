use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
  name = "brainstorming-cli",
  version,
  about = "Export native Brainstorming documents without a desktop session"
)]
pub struct Cli {
  #[command(subcommand)]
  pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
  /// Export one or more sheets using the same native pipeline as desktop.
  Export(Export),
  /// List sheet IDs and names as JSON, without changing the source document.
  Sheets(Source),
}
#[derive(Args)]
pub struct Source {
  pub input: PathBuf,
  /// Read the SQLCipher password from stdin (never from command-line arguments).
  #[arg(long)]
  pub password_stdin: bool,
}
#[derive(Args)]
pub struct Export {
  #[command(flatten)]
  pub source: Source,
  #[arg(short, long)]
  pub output: PathBuf,
  /// Required for a multi-sheet .zip; otherwise inferred from the output extension.
  #[arg(short,long,value_parser=["png","jpg","jpeg","webp","svg","pdf"])]
  pub format: Option<String>,
  /// Export specific sheet IDs; defaults to the first sheet.
  #[arg(long, conflicts_with = "all_sheets")]
  pub sheet: Vec<String>,
  #[arg(long)]
  pub all_sheets: bool,
  #[arg(long)]
  pub include_collapsed: bool,
  #[arg(long)]
  pub transparent: bool,
  #[arg(long)]
  pub presentation: bool,
  #[arg(long,conflicts_with_all=["width","height"])]
  pub scale: Option<f64>,
  #[arg(long)]
  pub width: Option<u32>,
  #[arg(long)]
  pub height: Option<u32>,
  #[arg(long)]
  pub jpeg_quality: Option<u8>,
  /// Atomically replace an existing output. Source files and aliases stay protected.
  #[arg(long)]
  pub overwrite: bool,
}
impl Command {
  pub fn source(&self) -> &Source {
    match self {
      Self::Export(args) => &args.source,
      Self::Sheets(args) => args,
    }
  }
}
