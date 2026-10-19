//! Narrow ownership-safe binding to libvips' stable C API. Pixel decoding,
//! orientation, resizing, and DeepZoom construction are performed by libvips.
use std::{
  ffi::{CString, c_char, c_int},
  path::{Path, PathBuf},
  ptr,
  sync::{Mutex, OnceLock},
};
type Result<T> = std::result::Result<T, String>;
use super::vips_ffi::*;
struct Image(*mut VipsImage, Option<*mut VipsSource>);
impl Image {
  fn checked(pointer: *mut VipsImage) -> Result<Self> {
    if pointer.is_null() {
      Err("图片无法解码".into())
    } else {
      Ok(Self(pointer, None))
    }
  }
  fn dimensions(&self) -> (u32, u32) {
    // SAFETY: self owns a live GObject ref of VipsImage type.
    unsafe {
      (
        vips_image_get_width(self.0).max(0) as u32,
        vips_image_get_height(self.0).max(0) as u32,
      )
    }
  }
}
impl Drop for Image {
  fn drop(&mut self) {
    unsafe {
      g_object_unref(self.0.cast());
      if let Some(source) = self.1 {
        g_object_unref(source.cast());
      }
    }
  }
}
pub struct Artifacts {
  pub directory: super::temporary::Directory,
  pub width: u32,
  pub height: u32,
  pub preview_width: u32,
  pub preview_height: u32,
  pub preview: PathBuf,
  pub tiles: Vec<(u32, u32, u32, PathBuf)>,
}
fn name(path: &Path) -> Result<CString> {
  CString::new(path.to_str().ok_or("图片路径编码无效")?).map_err(|_| "图片路径无效".into())
}
fn success(code: c_int) -> Result<()> {
  if code == 0 {
    Ok(())
  } else {
    unsafe {
      vips_error_clear();
    }
    Err("原生图片处理失败；原始资源保持完整".into())
  }
}
fn initialize() -> Result<()> {
  static INITIALIZED: OnceLock<bool> = OnceLock::new();
  if !*INITIALIZED.get_or_init(|| unsafe {
    if vips_init(c"brainstorming".as_ptr()) != 0 {
      return false;
    }
    // Sources and pixels must not survive an import in the global operation cache.
    vips_cache_set_max(0);
    vips_cache_set_max_mem(32 * 1024 * 1024);
    true
  }) {
    return Err("libvips 无法初始化".into());
  }
  Ok(())
}
pub fn prepare_file_cancelled(
  path: &Path,
  parent: &Path,
  cancel: &tokio_util::sync::CancellationToken,
) -> Result<Artifacts> {
  prepare(parent, Some(cancel), || {
    let path = name(path)?;
    // A VipsSource opens the exact granted filename. Unlike the filename
    // loader, it never interprets bracket characters as loader options.
    let source = unsafe { vips_source_new_from_file(path.as_ptr()) };
    if source.is_null() {
      return Err("图片文件无法打开".into());
    }
    let image = unsafe {
      vips_image_new_from_source(
        source,
        c"".as_ptr(),
        c"access".as_ptr(),
        1 as c_int,
        c"fail-on".as_ptr(),
        3 as c_int,
        ptr::null::<c_char>(),
      )
    };
    if image.is_null() {
      unsafe {
        g_object_unref(source.cast());
      }
      return Err("图片无法解码".into());
    }
    Ok(Image(image, Some(source)))
  })
}
pub fn prepare_bytes(bytes: &[u8], parent: &Path) -> Result<Artifacts> {
  prepare(parent, None, || {
    Image::checked(unsafe {
      vips_image_new_from_buffer(
        bytes.as_ptr().cast(),
        bytes.len(),
        c"".as_ptr(),
        c"access".as_ptr(),
        1 as c_int,
        c"fail-on".as_ptr(),
        3 as c_int,
        ptr::null::<c_char>(),
      )
    })
  })
}
fn prepare(
  parent: &Path,
  cancel: Option<&tokio_util::sync::CancellationToken>,
  mut load: impl FnMut() -> Result<Image>,
) -> Result<Artifacts> {
  check_cancel(cancel)?;
  static OPERATIONS: Mutex<()> = Mutex::new(());
  let _guard = OPERATIONS.lock().map_err(|_| "原生图片处理状态无效")?;
  check_cancel(cancel)?;
  initialize()?;
  let source = load()?;
  let (width, height) = source.dimensions();
  if width == 0
    || height == 0
    || width > 65536
    || height > 65536
    || u64::from(width) * u64::from(height) > 268_402_689
  {
    return Err("图片尺寸无效或超过像素限制".into());
  }
  let mut oriented = ptr::null_mut();
  success(unsafe { vips_autorot(source.0, &mut oriented, ptr::null::<c_char>()) })?;
  let oriented = Image::checked(oriented)?;
  let (width, height) = oriented.dimensions();
  let mut preview = ptr::null_mut();
  success(unsafe {
    vips_thumbnail_image(
      oriented.0,
      &mut preview,
      1600,
      c"height".as_ptr(),
      1600 as c_int,
      c"size".as_ptr(),
      2 as c_int,
      ptr::null::<c_char>(),
    )
  })?;
  let preview = Image::checked(preview)?;
  let (preview_width, preview_height) = preview.dimensions();
  std::fs::create_dir_all(parent).map_err(|_| "无法创建图片处理目录")?;
  let directory = tempfile::Builder::new()
    .prefix("image-")
    .tempdir_in(parent)
    .map_err(|_| "无法创建图片处理目录")?;
  let preview_path = directory.path().join("preview.webp");
  success(unsafe {
    vips_webpsave(
      preview.0,
      name(&preview_path)?.as_ptr(),
      c"Q".as_ptr(),
      82 as c_int,
      c"effort".as_ptr(),
      4 as c_int,
      ptr::null::<c_char>(),
    )
  })?;
  // Sequential decoders cannot be replayed after thumbnail evaluation. Open
  // an independent lazy pipeline for the full-resolution pyramid.
  drop(preview);
  drop(oriented);
  drop(source);
  let tiles_source = load()?;
  let mut tiles_oriented = ptr::null_mut();
  success(unsafe { vips_autorot(tiles_source.0, &mut tiles_oriented, ptr::null::<c_char>()) })?;
  let tiles_oriented = Image::checked(tiles_oriented)?;
  check_cancel(cancel)?;
  let tiles_path = directory.path().join("tiles");
  success(unsafe {
    vips_dzsave(
      tiles_oriented.0,
      name(&tiles_path)?.as_ptr(),
      c"tile-size".as_ptr(),
      512 as c_int,
      c"overlap".as_ptr(),
      1 as c_int,
      c"depth".as_ptr(),
      0 as c_int,
      c"skip-blanks".as_ptr(),
      -1 as c_int,
      c"suffix".as_ptr(),
      c".webp[Q=88,effort=4]".as_ptr(),
      ptr::null::<c_char>(),
    )
  })?;
  check_cancel(cancel)?;
  let max_level = (u32::BITS - (width.max(height) - 1).leading_zeros()).min(16);
  let tiles = gather_tiles(
    &directory.path().join("tiles_files"),
    width,
    height,
    max_level,
  )?;
  Ok(Artifacts {
    directory: super::temporary::Directory::wrap(directory),
    width,
    height,
    preview_width,
    preview_height,
    preview: preview_path,
    tiles,
  })
}
fn gather_tiles(
  root: &Path,
  width: u32,
  height: u32,
  max_level: u32,
) -> Result<Vec<(u32, u32, u32, PathBuf)>> {
  let mut output = Vec::new();
  for level in 0..=max_level {
    let scale = 1u32 << (max_level - level);
    let columns = width.div_ceil(scale).div_ceil(512);
    let rows = height.div_ceil(scale).div_ceil(512);
    for y in 0..rows {
      for x in 0..columns {
        let path = root.join(level.to_string()).join(format!("{x}_{y}.webp"));
        if !path.is_file() {
          return Err("图片瓦片生成不完整".into());
        }
        output.push((level, x, y, path));
        if output.len() > 100_000 {
          return Err("图片瓦片数量超过限制".into());
        }
      }
    }
  }
  Ok(output)
}

fn check_cancel(cancel: Option<&tokio_util::sync::CancellationToken>) -> Result<()> {
  if cancel.is_some_and(|token| token.is_cancelled()) {
    Err("图片处理已取消".into())
  } else {
    Ok(())
  }
}

pub(super) fn ensure_codec(mime: &str) -> Result<()> {
  initialize()?;
  let operation = match mime {
    "image/tiff" => c"tiffload",
    "image/avif" => c"heifload",
    "image/gif" => c"gifload",
    "image/jpeg" => c"jpegload",
    "image/png" => c"pngload",
    "image/webp" => c"webpload",
    _ => return Err("位图格式不受支持".into()),
  };
  if unsafe { vips_type_find(c"VipsOperation".as_ptr(), operation.as_ptr()) } == 0 {
    return Err(format!(
      "此平台 libvips 未包含 {mime} 解码器；原始文件保持完整"
    ));
  }
  Ok(())
}
