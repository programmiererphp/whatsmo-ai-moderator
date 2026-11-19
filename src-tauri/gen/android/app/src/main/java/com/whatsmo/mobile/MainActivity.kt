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

    // Recovery mode keeps the UI accessible while WhatsApp networking stays disabled.
    // Skip the session service, which otherwise starts regardless of the JS UI state.
    if (!java.io.File(filesDir, "whatsmo-safe-mode.flag").exists()) {
      try {
        ContextCompat.startForegroundService(this, Intent(this, WhatsmoKeepAliveService::class.java))
      } catch (error: Exception) {
        android.util.Log.e("Whatsmo", "Could not start keep-alive service", error)
        // Failure to launch a non-essential background service must not close UI.
      }
    }
  }
}
