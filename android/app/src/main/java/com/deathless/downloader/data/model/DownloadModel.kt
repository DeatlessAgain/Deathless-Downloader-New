package com.deathless.downloader.data.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

enum class DownloadStatus {
    QUEUED,
    CONNECTING,
    DOWNLOADING,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED
}

@Parcelize
data class DownloadTask(
    val id: String,
    val url: String,
    val title: String,
    val fileName: String,
    val fileSize: Long = 0L,
    val downloadedBytes: Long = 0L,
    val status: DownloadStatus = DownloadStatus.QUEUED,
    val speedBytesPerSec: Long = 0L,
    val etaSeconds: Long = 0L,
    val destinationPath: String = "",
    val mimeType: String = "video/mp4",
    val isAudioOnly: Boolean = false,
    val errorMessage: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val completedAt: Long? = null
) : Parcelable {

    val progress: Int
        get() = if (fileSize > 0) ((downloadedBytes * 100) / fileSize).toInt().coerceIn(0, 100) else 0

    val isTerminal: Boolean
        get() = status == DownloadStatus.COMPLETED || status == DownloadStatus.FAILED || status == DownloadStatus.CANCELLED

    val isResumable: Boolean
        get() = status == DownloadStatus.PAUSED || status == DownloadStatus.FAILED
}
