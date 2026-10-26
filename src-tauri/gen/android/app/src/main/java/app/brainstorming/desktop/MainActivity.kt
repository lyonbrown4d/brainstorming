package app.brainstorming.desktop

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Edge-to-edge windows must apply IME insets so WebView's viewport can resize.
    // System bar insets remain available to the renderer's safe-area CSS.
    val content = findViewById<View>(android.R.id.content)
    val originalBottom = content.paddingBottom
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      view.setPadding(view.paddingLeft, view.paddingTop, view.paddingRight, originalBottom + keyboard)
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }
}
