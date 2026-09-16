package com.deathless.downloader.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.deathless.downloader.R
import com.deathless.downloader.data.model.DownloadStatus
import com.deathless.downloader.data.model.DownloadTask
import com.deathless.downloader.data.repository.DownloadRepository
import com.deathless.downloader.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class DownloadForegroundService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val activeJobs = ConcurrentHashMap<String, Job>()
    private lateinit var notificationManager: NotificationManager

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(45, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    companion object {
        const val TAG = "DownloadService"
        const val CHANNEL_ID = "deathless_download_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.deathless.downloader.action.START"
        const val ACTION_PAUSE = "com.deathless.downloader.action.PAUSE"
        const val ACTION_RESUME = "com.deathless.downloader.action.RESUME"
        const val ACTION_CANCEL = "com.deathless.downloader.action.CANCEL"

        const val EXTRA_TASK_ID = "extra_task_id"

        fun startDownload(context: Context, taskId: String) {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TASK_ID, taskId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun pauseDownload(context: Context, taskId: String) {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                action = ACTION_PAUSE
                putExtra(EXTRA_TASK_ID, taskId)
            }
            context.startService(intent)
        }

        fun resumeDownload(context: Context, taskId: String) {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                action = ACTION_RESUME
                putExtra(EXTRA_TASK_ID, taskId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun cancelDownload(context: Context, taskId: String) {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                action = ACTION_CANCEL
                putExtra(EXTRA_TASK_ID, taskId)
            }
            context.startService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildInitialNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY
        val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return START_NOT_STICKY

        when (action) {
            ACTION_START, ACTION_RESUME -> {
                executeDownloadTask(taskId)
            }
            ACTION_PAUSE -> {
                pauseTask(taskId)
            }
            ACTION_CANCEL -> {
                cancelTask(taskId)
            }
        }

        return START_NOT_STICKY
    }

    private fun executeDownloadTask(taskId: String) {
        val task = DownloadRepository.getTask(taskId) ?: return

        // Cancel any existing job for this task
        activeJobs[taskId]?.cancel()

        val job = serviceScope.launch {
            DownloadRepository.updateTaskStatus(taskId, DownloadStatus.CONNECTING)

            val downloadDir = getPublicDownloadDirectory()
            val sanitizedName = sanitizeFilename(task.fileName)
            val targetFile = File(downloadDir, sanitizedName)

            var downloadedBytes = 0L
            if (targetFile.exists()) {
                downloadedBytes = targetFile.length()
            }

            try {
                val requestBuilder = Request.Builder()
                    .url(task.url)
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36")
                    .header("Accept", "*/*")

                if (downloadedBytes > 0) {
                    requestBuilder.header("Range", "bytes=$downloadedBytes-")
                }

                val request = requestBuilder.build()
                val response: Response = okHttpClient.newCall(request).execute()

                if (!response.isSuccessful) {
                    throw Exception("HTTP Error: ${response.code} ${response.message}")
                }

                val body = response.body ?: throw Exception("Empty response body from server")
                val isRangeResponse = response.code == 206
                val totalBytes = if (isRangeResponse) {
                    downloadedBytes + body.contentLength()
                } else {
                    downloadedBytes = 0L // Reset if server doesn't support partial range
                    body.contentLength()
                }

                DownloadRepository.updateTask(taskId) { current ->
                    current.copy(
                        status = DownloadStatus.DOWNLOADING,
                        fileSize = totalBytes,
                        downloadedBytes = downloadedBytes,
                        destinationPath = targetFile.absolutePath,
                        mimeType = body.contentType()?.toString() ?: current.mimeType
                    )
                }

                val randomAccessFile = RandomAccessFile(targetFile, "rw")
                if (isRangeResponse) {
                    randomAccessFile.seek(downloadedBytes)
                } else {
                    randomAccessFile.setLength(0)
                    randomAccessFile.seek(0)
                }

                val buffer = ByteArray(32 * 1024)
                val inputStream = body.byteStream()
                var readBytes = 0
                var lastProgressUpdate = System.currentTimeMillis()
                var bytesInWindow = 0L
                var currentSpeed = 0L

                randomAccessFile.use { raf ->
                    inputStream.use { stream ->
                        while (isActive && stream.read(buffer).also { readBytes = it } != -1) {
                            raf.write(buffer, 0, readBytes)
                            downloadedBytes += readBytes
                            bytesInWindow += readBytes

                            val now = System.currentTimeMillis()
                            val timeDelta = now - lastProgressUpdate

                            if (timeDelta >= 500) {
                                currentSpeed = (bytesInWindow * 1000) / timeDelta
                                bytesInWindow = 0L
                                lastProgressUpdate = now

                                val remainingBytes = (totalBytes - downloadedBytes).coerceAtLeast(0)
                                val eta = if (currentSpeed > 0) remainingBytes / currentSpeed else 0L

                                DownloadRepository.updateTask(taskId) { current ->
                                    current.copy(
                                        downloadedBytes = downloadedBytes,
                                        fileSize = totalBytes,
                                        speedBytesPerSec = currentSpeed,
                                        etaSeconds = eta,
                                        status = DownloadStatus.DOWNLOADING
                                    )
                                }

                                updateNotification(task.title, downloadedBytes, totalBytes, currentSpeed)
                            }
                        }
                    }
                }

                if (isActive) {
                    // Completed successfully
                    MediaScannerConnection.scanFile(
                        applicationContext,
                        arrayOf(targetFile.absolutePath),
                        arrayOf(task.mimeType),
                        null
                    )

                    DownloadRepository.updateTask(taskId) { current ->
                        current.copy(
                            status = DownloadStatus.COMPLETED,
                            downloadedBytes = totalBytes,
                            speedBytesPerSec = 0L,
                            etaSeconds = 0L,
                            completedAt = System.currentTimeMillis()
                        )
                    }

                    showCompletionNotification(task.title, targetFile.absolutePath)
                }

            } catch (e: Exception) {
                if (!isActive) {
                    Log.d(TAG, "Task $taskId was cancelled or paused")
                } else {
                    Log.e(TAG, "Download error for $taskId: ${e.message}", e)
                    DownloadRepository.updateTask(taskId) { current ->
                        current.copy(
                            status = DownloadStatus.FAILED,
                            errorMessage = e.message ?: "Unknown download error"
                        )
                    }
                }
            } finally {
                activeJobs.remove(taskId)
                checkStopForeground()
            }
        }

        activeJobs[taskId] = job
    }

    private fun pauseTask(taskId: String) {
        activeJobs[taskId]?.cancel()
        activeJobs.remove(taskId)
        DownloadRepository.updateTaskStatus(taskId, DownloadStatus.PAUSED)
        checkStopForeground()
    }

    private fun cancelTask(taskId: String) {
        activeJobs[taskId]?.cancel()
        activeJobs.remove(taskId)
        DownloadRepository.updateTaskStatus(taskId, DownloadStatus.CANCELLED)
        checkStopForeground()
    }

    private fun checkStopForeground() {
        if (activeJobs.isEmpty()) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun getPublicDownloadDirectory(): File {
        val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val appFolder = File(downloads, "DeathlessDownloader")
        if (!appFolder.exists()) {
            appFolder.mkdirs()
        }
        return appFolder
    }

    private fun sanitizeFilename(name: String): String {
        return name.replace("[\\\\/:*?\"<>|]".toRegex(), "_").trim().ifEmpty {
            "download_${System.currentTimeMillis()}.mp4"
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Deathless Downloader",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows real-time status of active video & audio downloads"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildInitialNotification(): Notification {
        val launchIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Deathless Downloader")
            .setContentText("Initializing background download service...")
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentIntent(launchIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(title: String, downloaded: Long, total: Long, speedBytes: Long) {
        val progress = if (total > 0) ((downloaded * 100) / total).toInt() else 0
        val speedMb = speedBytes / (1024.0 * 1024.0)
        val downloadedMb = downloaded / (1024.0 * 1024.0)
        val totalMb = total / (1024.0 * 1024.0)

        val text = if (total > 0) {
            String.format("%.1f MB / %.1f MB (%.1f MB/s)", downloadedMb, totalMb, speedMb)
        } else {
            String.format("%.1f MB downloaded (%.1f MB/s)", downloadedMb, speedMb)
        }

        val launchIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setProgress(100, progress, total <= 0)
            .setContentIntent(launchIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun showCompletionNotification(title: String, filePath: String) {
        val completionId = (System.currentTimeMillis() % 10000).toInt()
        val launchIntent = PendingIntent.getActivity(
            this,
            completionId,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Download Complete")
            .setContentText(title)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentIntent(launchIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        notificationManager.notify(completionId, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
