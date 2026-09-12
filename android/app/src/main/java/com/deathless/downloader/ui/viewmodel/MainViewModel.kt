package com.deathless.downloader.ui.viewmodel

import android.app.Application
import android.content.Context
import android.webkit.URLUtil
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.deathless.downloader.data.model.DownloadStatus
import com.deathless.downloader.data.model.DownloadTask
import com.deathless.downloader.data.repository.DownloadRepository
import com.deathless.downloader.service.DownloadForegroundService
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.net.URI
import java.util.UUID

class MainViewModel(application: Application) : AndroidViewModel(application) {

    val tasks: StateFlow<List<DownloadTask>> = DownloadRepository.tasksFlow

    val activeCount: StateFlow<Int> = tasks.map { list ->
        list.count { it.status == DownloadStatus.DOWNLOADING || it.status == DownloadStatus.CONNECTING }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val totalSpeedMbps: StateFlow<Double> = tasks.map { list ->
        val totalBytesPerSec = list.filter { it.status == DownloadStatus.DOWNLOADING }
            .sumOf { it.speedBytesPerSec }
        totalBytesPerSec / (1024.0 * 1024.0)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    private val _uiEvent = MutableSharedFlow<String>()
    val uiEvent: SharedFlow<String> = _uiEvent.asSharedFlow()

    init {
        DownloadRepository.init(application)
    }

    fun submitUrl(rawUrl: String, isAudioOnly: Boolean, customTitle: String? = null) {
        val trimmed = rawUrl.trim()
        if (trimmed.isEmpty()) {
            emitMessage("Please enter or paste a valid download URL")
            return
        }

        if (!URLUtil.isValidUrl(trimmed) && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            emitMessage("Invalid URL format. Please include http:// or https://")
            return
        }

        val parsedFileName = deriveFileName(trimmed, isAudioOnly, customTitle)
        val taskId = UUID.randomUUID().toString()
        val task = DownloadTask(
            id = taskId,
            url = trimmed,
            title = customTitle ?: parsedFileName.substringBeforeLast('.'),
            fileName = parsedFileName,
            isAudioOnly = isAudioOnly,
            mimeType = if (isAudioOnly) "audio/mpeg" else "video/mp4",
            status = DownloadStatus.QUEUED
        )

        DownloadRepository.addTask(task)
        DownloadForegroundService.startDownload(getApplication(), taskId)
        emitMessage("Download queued: ${task.title}")
    }

    fun pauseDownload(id: String) {
        DownloadForegroundService.pauseDownload(getApplication(), id)
        emitMessage("Download paused")
    }

    fun resumeDownload(id: String) {
        DownloadForegroundService.resumeDownload(getApplication(), id)
        emitMessage("Resuming download...")
    }

    fun cancelDownload(id: String) {
        DownloadForegroundService.cancelDownload(getApplication(), id)
        emitMessage("Download cancelled")
    }

    fun retryDownload(id: String) {
        val task = DownloadRepository.getTask(id) ?: return
        DownloadRepository.updateTask(id) { current ->
            current.copy(status = DownloadStatus.QUEUED, errorMessage = null)
        }
        DownloadForegroundService.startDownload(getApplication(), id)
        emitMessage("Retrying download...")
    }

    fun deleteTask(id: String) {
        DownloadForegroundService.cancelDownload(getApplication(), id)
        DownloadRepository.deleteTask(id)
        emitMessage("Removed from list")
    }

    fun clearCompleted() {
        DownloadRepository.clearCompleted()
        emitMessage("Cleared completed downloads")
    }

    private fun deriveFileName(url: String, isAudioOnly: Boolean, customTitle: String?): String {
        val ext = if (isAudioOnly) ".mp3" else ".mp4"
        if (!customTitle.isNullOrBlank()) {
            return "${customTitle.trim().replace("[\\\\/:*?\"<>|]".toRegex(), "_")}$ext"
        }

        return try {
            val uri = URI(url)
            val path = uri.path
            val lastSegment = path?.substringAfterLast('/')?.substringBefore('?')
            if (!lastSegment.isNullOrBlank() && lastSegment.length > 3) {
                if (lastSegment.contains('.')) lastSegment else "$lastSegment$ext"
            } else {
                "Media_${System.currentTimeMillis()}$ext"
            }
        } catch (e: Exception) {
            "Media_${System.currentTimeMillis()}$ext"
        }
    }

    private fun emitMessage(msg: String) {
        viewModelScope.launch {
            _uiEvent.emit(msg)
        }
    }
}
