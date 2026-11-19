package com.whatsmo.mobile

import android.content.Intent
import android.os.Bundle
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    CrashRecorder.install(this)
    super.onCreate(savedInstanceState)

    // Do not enable edge-to-edge without a tested WebView insets strategy.
    // On Android 11 with 3-button navigation, let the system fit the
    // activity above the navigation bar, keeping the chat composer visible.
    // This also avoids a custom root-view insets listener that may interfere
    // with Tauri's WebView lifecycle. See PR #2 regression.
    WindowCompat.setDecorFitsSystemWindows(window, true)

    ContextCompat.startForegroundService(this, Intent(this, WhatsmoKeepAliveService::class.java))
  }
}
