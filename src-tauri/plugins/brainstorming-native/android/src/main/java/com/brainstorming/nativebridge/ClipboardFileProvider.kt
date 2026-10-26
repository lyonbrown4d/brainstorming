package com.brainstorming.nativebridge

import androidx.core.content.FileProvider

// A separate component keeps clipboard grants apart from Tauri's file provider.
class ClipboardFileProvider : FileProvider()
