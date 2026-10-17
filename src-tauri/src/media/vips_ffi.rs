use std::ffi::{c_char, c_int, c_void};
#[repr(C)]
pub(super) struct VipsImage {
    _opaque: [u8; 0],
}
#[repr(C)]
pub(super) struct VipsSource {
    _opaque: [u8; 0],
}
unsafe extern "C" {
    pub(super) fn vips_type_find(base: *const c_char, nick: *const c_char) -> usize;
    pub(super) fn vips_init(name: *const c_char) -> c_int;
    pub(super) fn vips_cache_set_max(max: c_int);
    pub(super) fn vips_cache_set_max_mem(max: usize);
    pub(super) fn vips_source_new_from_file(name: *const c_char) -> *mut VipsSource;
    pub(super) fn vips_image_new_from_source(
        source: *mut VipsSource,
        options: *const c_char,
        ...
    ) -> *mut VipsImage;
    pub(super) fn vips_image_new_from_buffer(
        data: *const c_void,
        size: usize,
        options: *const c_char,
        ...
    ) -> *mut VipsImage;
    pub(super) fn vips_image_get_width(image: *const VipsImage) -> c_int;
    pub(super) fn vips_image_get_height(image: *const VipsImage) -> c_int;
    pub(super) fn vips_autorot(input: *mut VipsImage, output: *mut *mut VipsImage, ...) -> c_int;
    pub(super) fn vips_thumbnail_image(
        input: *mut VipsImage,
        output: *mut *mut VipsImage,
        width: c_int,
        ...
    ) -> c_int;
    pub(super) fn vips_webpsave(input: *mut VipsImage, filename: *const c_char, ...) -> c_int;
    pub(super) fn vips_dzsave(input: *mut VipsImage, filename: *const c_char, ...) -> c_int;
    pub(super) fn vips_error_clear();
}
unsafe extern "C" {
    pub(super) fn g_object_unref(object: *mut c_void);
}
