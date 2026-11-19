package com.whatsmo.mobile

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Tauri's WebView fills the screen. Keep its interactive content clear of
    // Android's status bar and 3-button/gesture navigation area on all devices.
    // In particular, CSS safe-area-inset-bottom may be zero on older WebViews.
    val root = findViewById<View>(android.R.id.content)
    val systemInsetTypes = WindowInsetsCompat.Type.systemBars() or
      WindowInsetsCompat.Type.displayCutout()
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, windowInsets ->
      val insets = windowInsets.getInsets(systemInsetTypes)
      view.setPadding(insets.left, insets.top, insets.right, insets.bottom)

      // Don't pass already-applied system bar insets into WebView: that would
      // produce duplicate CSS safe-area padding on newer WebView versions.
      // Preserve IME insets so the soft keyboard continues to resize content.
      WindowInsetsCompat.Builder(windowInsets)
        .setInsets(systemInsetTypes, Insets.NONE)
        .build()
    }
    ViewCompat.requestApplyInsets(root)
    ContextCompat.startForegroundService(this, Intent(this, WhatsmoKeepAliveService::class.java))
  }
}
