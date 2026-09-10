package com.deathless.downloader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Foreground Service guaranteeing background execution without system process kill
 * during device sleep, screen off, or battery saving modes.
 */
class DownloadForegroundService : Service() {

    companion object {
        const val TAG = "DownloadForegroundService"
        const val NOTIFICATION_ID = 9001
        const val CHANNEL_ID = MainActivity.CHANNEL_ID

        const val ACTION_START_OR_UPDATE = "ACTION_START_OR_UPDATE"
        const val ACTION_STOP_SERVICE = "ACTION_STOP_SERVICE"

        const val EXTRA_TITLE = "EXTRA_TITLE"
        const val EXTRA_PROGRESS = "EXTRA_PROGRESS"
        const val EXTRA_SPEED = "EXTRA_SPEED"
        const val EXTRA_ACTIVE_COUNT = "EXTRA_ACTIVE_COUNT"

        fun startOrUpdate(
            context: Context,
            title: String,
            progress: Int,
            speed: String = "0 KB/s",
            activeCount: Int = 1
        ) {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                action = ACTION_START_OR_UPDATE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_PROGRESS, progress)
                putExtra(EXTRA_SPEED, speed)
                putExtra(EXTRA_ACTIVE_COUNT, activeCount)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                action = ACTION_STOP_SERVICE
            }
            context.startService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var isForegroundActive = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_OR_UPDATE -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Downloading media..."
                val progress = intent.getIntExtra(EXTRA_PROGRESS, 0)
                val speed = intent.getStringExtra(EXTRA_SPEED) ?: "0 KB/s"
                val activeCount = intent.getIntExtra(EXTRA_ACTIVE_COUNT, 1)

                val notification = buildNotification(title, progress, speed, activeCount)

                if (!isForegroundActive) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ServiceCompat.startForeground(
                            this,
                            NOTIFICATION_ID,
                            notification,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                        )
                    } else {
                        startForeground(NOTIFICATION_ID, notification)
                    }
                    isForegroundActive = true
                    Log.d(TAG, "Foreground service started with persistent dataSync notification.")
                } else {
                    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    notificationManager.notify(NOTIFICATION_ID, notification)
                }
            }

            ACTION_STOP_SERVICE -> {
                Log.d(TAG, "Foreground service stopping...")
                stopForeground(STOP_FOREGROUND_REMOVE)
                isForegroundActive = false
                releaseWakeLock()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "DeathlessDownloader:ForegroundTransferLock"
            ).apply {
                setReferenceCounted(false)
                // 4 hour safety timeout
                acquire(4 * 60 * 60 * 1000L)
            }
            Log.d(TAG, "Acquired PARTIAL_WAKE_LOCK for uninterrupted large downloads.")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d(TAG, "Released PARTIAL_WAKE_LOCK.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing wake lock: ${e.message}")
        } finally {
            wakeLock = null
        }
    }

    private fun buildNotification(
        title: String,
        progress: Int,
        speed: String,
        activeCount: Int
    ): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val contentText = if (activeCount > 1) {
            "$title • $speed ($activeCount active downloads)"
        } else {
            "$title • $speed"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Deathless Downloader — Active Transfer")
            .setContentText(contentText)
            .setSubText("$progress%")
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentIntent(pendingIntent)
            .setProgress(100, progress, progress <= 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .build()
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }
}
