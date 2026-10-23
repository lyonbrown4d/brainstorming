use std::sync::{Arc, OnceLock};
use svg2pdf::usvg;

/// System font discovery is shared across exports; fonts are immutable afterwards.
pub(super) fn database() -> Arc<usvg::fontdb::Database> {
  static DATABASE: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
  DATABASE
    .get_or_init(|| {
      let mut database = usvg::fontdb::Database::new();
      let fonts = &mut database;
      fonts.load_system_fonts();
      #[cfg(target_os = "android")]
      for directory in ["/system/fonts", "/product/fonts", "/system_ext/fonts"] {
        fonts.load_fonts_dir(directory);
      }
      for family in [
        "PingFang SC",
        "Noto Sans CJK SC",
        "Microsoft YaHei",
        "WenQuanYi Zen Hei",
        "Arial",
      ] {
        if fonts
          .faces()
          .any(|face| face.families.iter().any(|(name, _)| name == family))
        {
          fonts.set_sans_serif_family(family);
          break;
        }
      }

      Arc::new(database)
    })
    .clone()
}
