package com.whatsmo.mobile

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import java.io.File
import java.util.Date

/**
 * Saves uncaught Java/Kotlin exceptions before Android terminates the process.
 * Does not intercept native segfaults, system kills, ANRs or force-stops.
 * Data stays in the application's private storage.
 */
object CrashRecorder {
  @Volatile private var installed = false

  @Synchronized fun install(context: Context) {
    if (installed) return
    val appContext = context.applicationContext ?: context
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val file = File(appContext.filesDir, "whatsmo-android-crash.log")
        // Bound retained crash logs to ~256 KB.
        if (file.exists() && file.length() > 256 * 1024) file.delete()
        file.appendText(
          "\n=== Android fatal exception " + Date().toString() + " ===\n" +
          "Thread: " + thread.name + "\n" +
          android.util.Log.getStackTraceString(error) + "\n"
        )
      } catch (_: Throwable) {
        // Never mask the original fatal error.
      }
      if (previous != null) {
        previous.uncaughtException(thread, error)
      } else {
        Runtime.getRuntime().halt(10)
      }
    }
    installed = true
    recordPreviousProcessExits(appContext)
  }

  /** Android 11+ may report why our previous process ended even when there was
   * no caught exception (ANR, native crash, low memory, etc.).
   */
  private fun recordPreviousProcessExits(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    try {
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val prefs = context.getSharedPreferences("whatsmo_diagnostics", Context.MODE_PRIVATE)
      val lastRecorded = prefs.getLong("last_process_exit_timestamp", 0L)
      val exits = manager.getHistoricalProcessExitReasons(null, 0, 8)
        .filter { it.timestamp > lastRecorded }
        .sortedBy { it.timestamp }
      if (exits.isEmpty()) return
      val file = File(context.filesDir, "whatsmo-android-crash.log")
      if (file.exists() && file.length() > 256 * 1024) file.delete()
      for (exit in exits) {
        file.appendText(
          "\n=== Android previous process exit " + Date(exit.timestamp) + " ===\n" +
          "reasonCode=" + exit.reason + " status=" + exit.status +
          " importance=" + exit.importance + "\n" +
          "description=" + (exit.description ?: "") + "\n"
        )
      }
      prefs.edit().putLong("last_process_exit_timestamp", exits.last().timestamp).apply()
    } catch (_: Throwable) {
      // Optional OS diagnostics must never prevent app startup.
    }
  }
}
