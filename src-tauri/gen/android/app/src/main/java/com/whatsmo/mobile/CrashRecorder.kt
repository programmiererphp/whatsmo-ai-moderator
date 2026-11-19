package com.whatsmo.mobile

import android.content.Context
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
  }
}
