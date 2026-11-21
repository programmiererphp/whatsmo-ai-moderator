package com.whatsmo.mobile

import android.app.Activity
import android.app.ActivityManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.text.method.ScrollingMovementMethod
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.File
import java.io.RandomAccessFile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Completely native recovery UI: no Tauri, Rust initialization, WebView,
 * WhatsApp network connection, or foreground session service is started.
 * Runs in a separate process so a crashing messaging process cannot take
 * the visible recovery screen down with it.
 */
class RecoveryActivity : Activity() {
  private lateinit var reportText: TextView
  private lateinit var statusText: TextView
  private lateinit var modeButton: Button
  private lateinit var sendGuardButton: Button
  private var report = ""

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    CrashRecorder.install(this)
    createScreen()
    refresh()
  }

  private fun createScreen() {
    val scroll = ScrollView(this)
    scroll.setBackgroundColor(Color.rgb(17, 27, 33))
    val container = LinearLayout(this)
    container.orientation = LinearLayout.VERTICAL
    container.setPadding(24, 22, 24, 28)
    scroll.addView(container)

    val header = TextView(this)
    header.text = "Whatsmo Recovery"
    header.textSize = 24f
    header.setTextColor(Color.WHITE)
    container.addView(header)
    val intro = TextView(this)
    intro.text = "Independent Android diagnostics. The WhatsApp connection and WebView are not started here. Copy the report even if the main app crashes."
    intro.textSize = 14f
    intro.setTextColor(Color.LTGRAY)
    intro.setPadding(0, 10, 0, 14)
    container.addView(intro)

    statusText = TextView(this)
    statusText.textSize = 14f
    statusText.setTextColor(Color.WHITE)
    container.addView(statusText)
    modeButton = actionButton(container, "Enable safe mode") {
      val enabled = !isSafeMode()
      setSafeMode(enabled)
      refresh()
    }
    sendGuardButton = actionButton(container, "Allow one diagnostic send") {
      val flag = File(filesDir, "whatsmo-native-send-once.flag")
      try {
        if (flag.exists()) flag.delete() else flag.writeText("1")
        refresh()
      } catch (error: Exception) {
        statusText.text = "Could not change send protection: " + error.javaClass.simpleName
      }
    }
    val sendHint = TextView(this)
    sendHint.text = "Android confirmed SIGSEGV while sending. To prevent repeated crashes, text sending is blocked by default. Enable exactly one diagnostic send only when testing your own account. This may crash Whatsmo; the Recovery screen will remain available. Automatic typing presence and read receipts are paused during crash isolation."
    sendHint.textSize = 12f
    sendHint.setTextColor(Color.LTGRAY)
    sendHint.setPadding(0, 4, 0, 10)
    container.addView(sendHint)
    actionButton(container, "Copy diagnostic report") {
      val manager = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      manager.setPrimaryClip(ClipData.newPlainText("Whatsmo diagnostics", report))
      statusText.text = (if (isSafeMode()) "Safe mode ON" else "Normal startup") + " · Report copied"
    }
    actionButton(container, "Share report") {
      try {
        val intent = Intent(Intent.ACTION_SEND).apply {
          type = "text/plain"
          putExtra(Intent.EXTRA_SUBJECT, "Whatsmo Android crash report")
          putExtra(Intent.EXTRA_TEXT, report)
        }
        startActivity(Intent.createChooser(intent, "Share diagnostic report"))
      } catch (error: Exception) {
        statusText.text = "Could not open Share: " + error.javaClass.simpleName
      }
    }
    actionButton(container, "Refresh logs") { refresh() }
    actionButton(container, "Open Whatsmo") {
      startActivity(Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      })
      finish()
    }
    val warning = TextView(this)
    warning.text = "Review this report before sharing. Redaction of personal data is best-effort. Do not uninstall or clear Whatsmo data."
    warning.textSize = 12f
    warning.setTextColor(Color.LTGRAY)
    warning.setPadding(0, 14, 0, 12)
    container.addView(warning)

    reportText = TextView(this)
    reportText.textSize = 11f
    reportText.setTextColor(Color.WHITE)
    reportText.setTextIsSelectable(true)
    reportText.movementMethod = ScrollingMovementMethod()
    container.addView(reportText, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    setContentView(scroll)
  }

  private fun actionButton(parent: LinearLayout, label: String, handler: () -> Unit): Button {
    val button = Button(this)
    button.text = label
    button.isAllCaps = false
    button.setOnClickListener { handler() }
    parent.addView(button, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    return button
  }

  private fun isSafeMode(): Boolean = File(filesDir, SAFE_MODE_FILE).exists()

  private fun setSafeMode(value: Boolean) {
    val flag = File(filesDir, SAFE_MODE_FILE)
    try {
      if (value) {
        flag.writeText("1")
        // No WhatsApp session service should stay running in recovery mode.
        try { stopService(Intent(this, WhatsmoKeepAliveService::class.java)) }
        catch (_: Exception) { /* no session service to stop */ }
      } else flag.delete()
    } catch (error: Exception) {
      statusText.text = "Safe mode change failed: " + error.javaClass.simpleName
    }
  }

  private fun refresh() {
    sendGuardButton.text = if (File(filesDir, "whatsmo-native-send-once.flag").exists()) {
      "Cancel armed send test"
    } else "Allow one diagnostic send (may crash)"
    modeButton.text = if (isSafeMode()) "Disable safe mode" else "Enable safe mode"
    statusText.text = if (isSafeMode()) {
      "Safe mode ON: WhatsApp reconnect and background service are disabled."
    } else "Normal startup: WhatsApp reconnect is enabled."
    report = buildReport()
    // Keep the display compact; Copy/Share always exports the full report.
    reportText.text = report.takeLast(28000)
  }

  private fun buildReport(): String {
    val sb = StringBuilder()
    sb.append("Whatsmo Android recovery report\n")
    sb.append("Created: ").append(Date().toString()).append('\n')
    sb.append("Android SDK: ").append(Build.VERSION.SDK_INT).append('\n')
    sb.append("Device: ").append(Build.MANUFACTURER).append(" / ").append(Build.MODEL).append('\n')
    sb.append("Safe mode: ").append(isSafeMode()).append('\n')
    sb.append("App version: ")
    try {
      @Suppress("DEPRECATION")
      val info = packageManager.getPackageInfo(packageName, 0)
      sb.append(info.versionName).append('\n')
    } catch (_: Exception) { sb.append("unknown\n") }

    sb.append("\n=== ANDROID PROCESS EXIT REASONS ===\n")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      try {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val items = manager.getHistoricalProcessExitReasons(null, 0, 12)
        if (items.isEmpty()) sb.append("No previous process exits returned by OS.\n")
        for (item in items) {
          sb.append(Date(item.timestamp).toString())
            .append(" process=").append(item.processName)
            .append(" reason=").append(exitReason(item.reason))
            .append(" status=").append(item.status)
            .append(" importance=").append(item.importance).append('\n')
        }
      } catch (error: Exception) {
        sb.append("Exit reason unavailable: ").append(error.javaClass.simpleName).append('\n')
      }
    } else sb.append("Requires Android 11+\n")

    sb.append("\n=== NATIVE SEND SAFETY ===\n")
    sb.append("Automatic typing presence/read receipts: paused for Android crash isolation\n")
    sb.append("One-shot send armed: ")
      .append(File(filesDir, "whatsmo-native-send-once.flag").exists()).append('\n')
    sb.append("Last native send boundary: ")
      .append(readTail(File(filesDir, "whatsmo-native-send-stage.log"), 1000))
      .append('\n')

    sb.append("\n=== APPLICATION CRASH LOG ===\n")
    sb.append(readTail(File(filesDir, "whatsmo-android-crash.log"), 24000))
    sb.append("\n=== LAST JAVASCRIPT EVENTS (NATIVE SNAPSHOT) ===\n")
    val jsFiles = findFiles("whatsmo-js-diagnostics.log")
    if (jsFiles.isEmpty()) sb.append("No snapshot has been written yet.\n")
    for (file in jsFiles.take(2)) sb.append(readTail(file, 18000)).append('\n')
    sb.append("\n=== RUST / TAURI LOGS ===\n")
    val nativeFiles = findFiles("crash.log", "whatsmo.log")
    if (nativeFiles.isEmpty()) sb.append("No Rust log files found.\n")
    for (file in nativeFiles.take(5)) {
      sb.append("File: ").append(file.name).append('\n')
      sb.append(readTail(file, 15000)).append('\n')
    }
    return redact(sb.toString()).takeLast(110000)
  }

  private fun findFiles(vararg prefixes: String): List<File> {
    val roots = listOf(filesDir, cacheDir, noBackupFilesDir, getExternalFilesDir(null))
      .filterNotNull().distinct()
    val found = mutableListOf<File>()
    fun scan(dir: File, depth: Int) {
      if (depth < 0 || found.size >= 40) return
      val files = try { dir.listFiles()?.toList() ?: emptyList() }
        catch (_: Exception) { emptyList() }
      for (file in files.take(120)) {
        if (file.isDirectory && depth > 0) {
          // Limit traversal to app-local diagnostic directories; never scan
          // WhatsApp databases, arbitrary media folders or downloads.
          if (file.name in listOf("logs", "log", "data", "files", "diagnostics"))
            scan(file, depth - 1)
        } else if (file.isFile && prefixes.any { file.name == it || file.name.startsWith(it + ".") }) {
          found.add(file)
        }
      }
    }
    for (root in roots) scan(root, 3)
    return found.distinctBy { it.absolutePath }.sortedByDescending { it.lastModified() }
  }

  private fun readTail(file: File, maxBytes: Int): String {
    if (!file.isFile) return "No log file found.\n"
    return try {
      RandomAccessFile(file, "r").use { raf ->
        val toRead = raf.length().coerceAtMost(maxBytes.toLong()).toInt()
        raf.seek(raf.length() - toRead)
        val data = ByteArray(toRead)
        raf.readFully(data)
        String(data, Charsets.UTF_8)
      }
    } catch (error: Exception) {
      "Could not read " + file.name + ": " + error.javaClass.simpleName + "\n"
    }
  }

  private fun exitReason(reason: Int): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return reason.toString()
    return when (reason) {
      android.app.ApplicationExitInfo.REASON_CRASH -> "JAVA_CRASH"
      android.app.ApplicationExitInfo.REASON_CRASH_NATIVE -> "NATIVE_CRASH"
      android.app.ApplicationExitInfo.REASON_ANR -> "ANR"
      android.app.ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
      android.app.ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED"
      android.app.ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED"
      android.app.ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF"
      else -> "OTHER_" + reason
    }
  }

  private fun redact(source: String): String {
    return source
      .replace(Regex("(?i)Bearer\\s+[A-Za-z0-9._~+/-]{8,}"), "[credential]")
      .replace(Regex("(?i)sk-[A-Za-z0-9_-]{10,}"), "[credential]")
      .replace(Regex("(?i)(api[_-]?key|token|secret|password)\\s*[:=]\\s*[^\\s,;}]+"), "[credential]")
      .replace(Regex("(?i)https?://[^\\s\\\"'<>]+"), "[url]")
      .replace(Regex("[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"), "[email]")
      .replace(Regex("[A-Za-z0-9+_.:-]+@(?:lid|g\\.us|s\\.whatsapp\\.net)"), "[chat-id]")
      .replace(Regex("\\+?\\d[\\d() .-]{7,}\\d"), "[number]")
  }

  companion object { private const val SAFE_MODE_FILE = "whatsmo-safe-mode.flag" }
}
