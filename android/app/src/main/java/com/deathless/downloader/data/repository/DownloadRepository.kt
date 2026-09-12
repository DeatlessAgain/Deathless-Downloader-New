package com.deathless.downloader.data.repository

import android.content.Context
import android.content.SharedPreferences
import com.deathless.downloader.data.model.DownloadStatus
import com.deathless.downloader.data.model.DownloadTask
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.ConcurrentHashMap

object DownloadRepository {

    private const val PREFS_NAME = "deathless_downloader_prefs"
    private const val KEY_TASKS = "key_saved_tasks"

    private val gson = Gson()
    private var sharedPreferences: SharedPreferences? = null

    private val tasksMap = ConcurrentHashMap<String, DownloadTask>()
    private val _tasksFlow = MutableStateFlow<List<DownloadTask>>(emptyList())
    val tasksFlow: StateFlow<List<DownloadTask>> = _tasksFlow.asStateFlow()

    fun init(context: Context) {
        if (sharedPreferences != null) return

        sharedPreferences = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        loadPersistedTasks()
    }

    @Synchronized
    private fun loadPersistedTasks() {
        val json = sharedPreferences?.getString(KEY_TASKS, null) ?: return
        try {
            val type = object : TypeToken<List<DownloadTask>>() {}.type
            val savedList: List<DownloadTask> = gson.fromJson(json, type) ?: emptyList()

            tasksMap.clear()
            savedList.forEach { task ->
                // If the app crashed or process was killed while downloading, mark as PAUSED
                val adjustedTask = if (task.status == DownloadStatus.DOWNLOADING || task.status == DownloadStatus.CONNECTING) {
                    task.copy(status = DownloadStatus.PAUSED, speedBytesPerSec = 0L)
                } else {
                    task
                }
                tasksMap[adjustedTask.id] = adjustedTask
            }
            emitTasks()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @Synchronized
    private fun saveTasksToDisk() {
        val list = tasksMap.values.sortedByDescending { it.createdAt }
        val json = gson.toJson(list)
        sharedPreferences?.edit()?.putString(KEY_TASKS, json)?.apply()
    }

    private fun emitTasks() {
        _tasksFlow.value = tasksMap.values.sortedByDescending { it.createdAt }
    }

    fun addTask(task: DownloadTask) {
        tasksMap[task.id] = task
        emitTasks()
        saveTasksToDisk()
    }

    fun getTask(id: String): DownloadTask? {
        return tasksMap[id]
    }

    fun updateTask(id: String, transform: (DownloadTask) -> DownloadTask) {
        val current = tasksMap[id] ?: return
        val updated = transform(current)
        tasksMap[id] = updated
        emitTasks()
        if (updated.status != current.status || updated.isTerminal) {
            saveTasksToDisk()
        }
    }

    fun updateTaskStatus(id: String, status: DownloadStatus) {
        updateTask(id) { current ->
            current.copy(
                status = status,
                speedBytesPerSec = if (status != DownloadStatus.DOWNLOADING) 0L else current.speedBytesPerSec
            )
        }
    }

    fun deleteTask(id: String) {
        tasksMap.remove(id)
        emitTasks()
        saveTasksToDisk()
    }

    fun clearCompleted() {
        val iterator = tasksMap.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (entry.value.status == DownloadStatus.COMPLETED) {
                iterator.remove()
            }
        }
        emitTasks()
        saveTasksToDisk()
    }
}
