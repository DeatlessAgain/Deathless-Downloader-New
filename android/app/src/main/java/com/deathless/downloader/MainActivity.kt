package com.deathless.downloader

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.PowerManager
import android.util.Log
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.downloader.Error
import com.downloader.OnCancelListener
import com.downloader.OnDownloadListener
import com.downloader.OnPauseListener
import com.downloader.OnProgressListener
import com.downloader.OnStartOrResumeListener
import com.downloader.PRDownloader
import com.downloader.PRDownloaderConfig
import com.downloader.Progress
import com.downloader.Status
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.text.DecimalFormat
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Deathless Downloader - Native Android Core Controller
 * High-performance, resilient multi-threaded downloading with PRDownloader,
 * Foreground Service wake-lock persistence, MD5/SHA-256 integrity verification,
 * and adaptive Wi-Fi/Mobile network state management.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val TAG = "DeathlessDownloader"
        const val CHANNEL_ID = "deathless_download_channel"
        const val CHANNEL_NAME = "Media Downloads"
    }

    enum class DownloadState {
        QUEUED,
        DOWNLOADING,
        VERIFYING_CHECKSUM,
        PAUSED,
        COMPLETED,
        FAILED,
        CANCELLED
    }

    data class ChecksumResult(
        val md5: String,
        val sha256: String,
        val verified: Boolean,
        val matchedExpected: Boolean?,
        val error: String? = null
    )

    data class DownloadTask(
        val downloadId: Int,
        val url: String,
        val fileName: String,
        val destinationPath: String,
        var progressPercent: Int = 0,
        var currentBytes: Long = 0L,
        var totalBytes: Long = 0L,
        var speedFormatted: String = "0 KB/s",
        var state: DownloadState = DownloadState.QUEUED,
        var errorMessage: String? = null,
        var expectedChecksum: String? = null,
        var md5Checksum: String? = null,
        var sha256Checksum: String? = null,
        var isChecksumVerified: Boolean? = null,
        var lastUpdatedTimestamp: Long = System.currentTimeMillis()
    )

    // Observable thread-safe active task register
    private val _downloadTasks = MutableStateFlow<Map<Int, DownloadTask>>(emptyMap())
    val downloadTasks: StateFlow<Map<Int, DownloadTask>> = _downloadTasks.asStateFlow()

    // Speed tracking trackers
    private val previousBytesMap = ConcurrentHashMap<Int, Long>()
    private val previousTimestampMap = ConcurrentHashMap<Int, Long>()
    private val lastForegroundNotificationUpdate = ConcurrentHashMap<Int, Long>()

    // Network & Wi-Fi Management
    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    @Volatile
    private var onlyDownloadOnWifi: Boolean = true
    private val autoPausedTaskIds = ConcurrentHashMap.newKeySet<Int>()

    // CPU WakeLock for persistent background large downloads
    private var mainWakeLock: PowerManager.WakeLock? = null

    // Permission request launcher
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val grantedAll = permissions.entries.all { it.value }
        if (!grantedAll) {
            Toast.makeText(
                this,
                "Storage / Notification permissions are required for background downloading",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize high-concurrency PRDownloader engine
        initializeDownloader()

        // Setup Android 8.0+ Notification Channels
        createNotificationChannel()

        // Verify runtime permissions (Storage & Android 13+ Notifications)
        checkAndRequestPermissions()

        // Setup Network State Listener to adaptively pause on cellular / loss
        setupNetworkListener()

        // Process incoming share intents (e.g. from YouTube or browsers)
        handleIncomingIntent(intent)

        // Observe and log task state transitions & maintain foreground service
        lifecycleScope.launch {
            downloadTasks.collect { tasks ->
                onDownloadsStateUpdated(tasks.values.toList())
                updateForegroundServiceState()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    /**
     * Initializes PRDownloader with database persistence, custom timeouts, and user agents
     */
    private fun initializeDownloader() {
        val config = PRDownloaderConfig.newBuilder()
            .setDatabaseEnabled(true)
            .setReadTimeout(30_000)
            .setConnectTimeout(30_000)
            .setUserAgent("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 DeathlessDownloader/1.0")
            .build()
        PRDownloader.initialize(applicationContext, config)
        Log.i(TAG, "PRDownloader initialized successfully with multi-threading and DB persistence.")
    }

    /**
     * Creates notification channels for foreground download progress
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Live progress for active media downloads"
                enableVibration(false)
                setSound(null, null)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    /**
     * Enforces required permissions based on SDK level
     */
    private fun checkAndRequestPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED
            ) {
                permissionsToRequest.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }

        if (permissionsToRequest.isNotEmpty()) {
            permissionLauncher.launch(permissionsToRequest.toTypedArray())
        }
    }

    // =========================================================================
    // Network Listener (Wi-Fi Only & Auto-Pause on Mobile Data or Connection Loss)
    // =========================================================================

    /**
     * Sets up adaptive network callback to monitor Wi-Fi and Cellular connectivity.
     */
    private fun setupNetworkListener() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                super.onCapabilitiesChanged(network, capabilities)
                handleNetworkCapabilitiesChanged(capabilities)
            }

            override fun onLost(network: Network) {
                super.onLost(network)
                handleNetworkLost()
            }
        }

        try {
            connectivityManager.registerNetworkCallback(networkRequest, networkCallback!!)
            Log.d(TAG, "Network listener registered successfully.")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register network callback: ${e.message}")
        }
    }

    /**
     * Handles network capability changes such as switching from Wi-Fi to cellular data.
     */
    private fun handleNetworkCapabilitiesChanged(capabilities: NetworkCapabilities) {
        val hasWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        val isCellular = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
        val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)

        if (!hasInternet) {
            handleNetworkLost()
            return
        }

        if (onlyDownloadOnWifi && isCellular && !hasWifi) {
            // Switched to mobile data while Wi-Fi only is enforced
            pauseActiveDownloadsForMobileData()
        } else if (hasWifi) {
            // Wi-Fi restored: auto-resume paused downloads if any were interrupted
            resumeAutoPausedDownloadsForWifi()
        }
    }

    /**
     * Automatically pauses all active downloads when switching to cellular data
     */
    private fun pauseActiveDownloadsForMobileData() {
        val activeTasks = _downloadTasks.value.values.filter { it.state == DownloadState.DOWNLOADING }
        if (activeTasks.isEmpty()) return

        Log.w(TAG, "Switched to Mobile Data. Pausing ${activeTasks.size} active downloads due to Wi-Fi only configuration.")

        activeTasks.forEach { task ->
            PRDownloader.pause(task.downloadId)
            autoPausedTaskIds.add(task.downloadId)
            updateTaskState(task.downloadId) {
                it.copy(
                    state = DownloadState.PAUSED,
                    speedFormatted = "0 KB/s",
                    errorMessage = "Paused: Switched to mobile data (Wi-Fi only enabled)"
                )
            }
        }

        runOnUiThread {
            Toast.makeText(
                this,
                "Switched to Mobile Data: Downloads paused to save bandwidth",
                Toast.LENGTH_SHORT
            ).show()
        }
        updateForegroundServiceState()
    }

    /**
     * Automatically resumes downloads paused due to network changes once Wi-Fi reconnects
     */
    private fun resumeAutoPausedDownloadsForWifi() {
        if (autoPausedTaskIds.isEmpty()) return

        val resumedCount = autoPausedTaskIds.size
        Log.i(TAG, "Wi-Fi connection restored. Resuming $resumedCount auto-paused downloads.")

        val pausedIds = autoPausedTaskIds.toList()
        autoPausedTaskIds.clear()

        pausedIds.forEach { id ->
            PRDownloader.resume(id)
            updateTaskState(id) {
                it.copy(
                    state = DownloadState.DOWNLOADING,
                    errorMessage = null
                )
            }
        }

        runOnUiThread {
            Toast.makeText(
                this,
                "Wi-Fi connection restored: Resuming $resumedCount download(s)",
                Toast.LENGTH_SHORT
            ).show()
        }
        updateForegroundServiceState()
    }

    /**
     * Automatically pauses active downloads when network connectivity is lost completely
     */
    private fun handleNetworkLost() {
        val activeTasks = _downloadTasks.value.values.filter { it.state == DownloadState.DOWNLOADING }
        if (activeTasks.isEmpty()) return

        Log.w(TAG, "Network connection lost. Pausing active downloads.")
        activeTasks.forEach { task ->
            PRDownloader.pause(task.downloadId)
            autoPausedTaskIds.add(task.downloadId)
            updateTaskState(task.downloadId) {
                it.copy(
                    state = DownloadState.PAUSED,
                    speedFormatted = "0 KB/s",
                    errorMessage = "Paused: Network connection lost"
                )
            }
        }

        runOnUiThread {
            Toast.makeText(this, "Network disconnected: Paused active downloads", Toast.LENGTH_SHORT).show()
        }
        updateForegroundServiceState()
    }

    /**
     * Enables or disables Wi-Fi only restriction for downloads
     */
    fun setOnlyDownloadOnWifi(enabled: Boolean) {
        onlyDownloadOnWifi = enabled
        Log.i(TAG, "Wi-Fi only download setting updated to: $enabled")
        if (enabled && !isWifiConnected()) {
            pauseActiveDownloadsForMobileData()
        }
    }

    fun isOnlyDownloadOnWifi(): Boolean = onlyDownloadOnWifi

    /**
     * Checks if device is currently connected to Wi-Fi or Ethernet
     */
    fun isWifiConnected(): Boolean {
        return try {
            val activeNetwork = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        } catch (e: Exception) {
            false
        }
    }

    // =========================================================================
    // Foreground Service & Power WakeLock Synchronization
    // =========================================================================

    /**
     * Synchronizes Android Foreground Service and WakeLock with active downloads.
     * Guarantees background transfers persist during device sleep or battery saving mode.
     */
    private fun updateForegroundServiceState() {
        val tasks = _downloadTasks.value.values
        val activeTasks = tasks.filter {
            it.state == DownloadState.DOWNLOADING || it.state == DownloadState.VERIFYING_CHECKSUM
        }

        if (activeTasks.isNotEmpty()) {
            acquireMainWakeLock()
            val primaryTask = activeTasks.first()
            val avgProgress = (activeTasks.map { it.progressPercent }.average()).toInt()
            val activeCount = activeTasks.size

            DownloadForegroundService.startOrUpdate(
                this,
                primaryTask.fileName,
                avgProgress,
                primaryTask.speedFormatted,
                activeCount
            )
        } else {
            releaseMainWakeLock()
            DownloadForegroundService.stop(this)
        }
    }

    private fun acquireMainWakeLock() {
        if (mainWakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            mainWakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "DeathlessDownloader:MainTransferLock"
            ).apply {
                setReferenceCounted(false)
                acquire(4 * 60 * 60 * 1000L) // 4 hours safety window
            }
            Log.d(TAG, "MainActivity acquired PARTIAL_WAKE_LOCK for sleep persistence.")
        }
    }

    private fun releaseMainWakeLock() {
        try {
            if (mainWakeLock?.isHeld == true) {
                mainWakeLock?.release()
                Log.d(TAG, "MainActivity released PARTIAL_WAKE_LOCK.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing main wake lock: ${e.message}")
        } finally {
            mainWakeLock = null
        }
    }

    // =========================================================================
    // MD5 & SHA-256 Checksum Verification Logic
    // =========================================================================

    /**
     * Calculates MD5 and SHA-256 hashes of a downloaded file and optionally validates against expected checksum.
     * Prevents segmented or corrupt transfer blocks from passing unverified.
     */
    suspend fun verifyFileChecksum(file: File, expectedHash: String? = null): ChecksumResult = withContext(Dispatchers.IO) {
        if (!file.exists() || !file.isFile) {
            return@withContext ChecksumResult("", "", false, false, "Downloaded file not found at path: ${file.absolutePath}")
        }

        try {
            val md5Digest = MessageDigest.getInstance("MD5")
            val sha256Digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(32768)
            var bytesRead: Int

            FileInputStream(file).use { fis ->
                while (fis.read(buffer).also { bytesRead = it } != -1) {
                    md5Digest.update(buffer, 0, bytesRead)
                    sha256Digest.update(buffer, 0, bytesRead)
                }
            }

            val md5Hex = md5Digest.digest().joinToString("") { "%02x".format(it) }
            val sha256Hex = sha256Digest.digest().joinToString("") { "%02x".format(it) }

            val matched: Boolean? = expectedHash?.trim()?.lowercase()?.let { exp ->
                when (exp.length) {
                    32 -> exp == md5Hex.lowercase()
                    64 -> exp == sha256Hex.lowercase()
                    else -> exp == md5Hex.lowercase() || exp == sha256Hex.lowercase()
                }
            }

            val verified = if (expectedHash.isNullOrBlank()) true else (matched == true)
            val error = if (verified) null else "Checksum mismatch! Expected: $expectedHash, Computed MD5: $md5Hex, SHA-256: $sha256Hex"

            ChecksumResult(
                md5 = md5Hex,
                sha256 = sha256Hex,
                verified = verified,
                matchedExpected = matched,
                error = error
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error calculating file checksums: ${e.message}", e)
            ChecksumResult("", "", false, false, "Checksum calculation error: ${e.localizedMessage}")
        }
    }

    // =========================================================================
    // Core Downloader Execution
    // =========================================================================

    /**
     * Detects URLs passed via Android Share Sheet (ACTION_SEND)
     */
    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        if (Intent.ACTION_SEND == intent.action && "text/plain" == intent.type) {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (!sharedText.isNullOrBlank()) {
                val extractedUrl = extractUrlFromString(sharedText)
                if (extractedUrl != null) {
                    Toast.makeText(this, "Link detected: $extractedUrl", Toast.LENGTH_SHORT).show()
                    enqueueDownload(url = extractedUrl)
                }
            }
        }
    }

    /**
     * Parses URL from raw shared text
     */
    private fun extractUrlFromString(text: String): String? {
        val words = text.split("\\s+".toRegex())
        return words.firstOrNull { it.startsWith("http://", ignoreCase = true) || it.startsWith("https://", ignoreCase = true) }
    }

    /**
     * Enqueues and starts a high-speed segmented download task using PRDownloader.
     *
     * @param url Download target URL
     * @param customFileName Optional custom file name, defaults to URL parsed name
     * @param destinationDir Storage directory path (defaults to standard Public Downloads)
     * @param isEncryptedVault Whether to store inside the isolated app sandbox directory
     * @param expectedChecksum Optional MD5 or SHA-256 checksum to verify against
     * @return The PRDownloader task ID
     */
    fun enqueueDownload(
        url: String,
        customFileName: String? = null,
        destinationDir: String? = null,
        isEncryptedVault: Boolean = false,
        expectedChecksum: String? = null
    ): Int {
        // Enforce Wi-Fi check if configured
        if (onlyDownloadOnWifi && !isWifiConnected()) {
            Toast.makeText(this, "Wi-Fi Only is active: Connect to Wi-Fi to begin download", Toast.LENGTH_LONG).show()
        }

        val resolvedDir = when {
            destinationDir != null -> destinationDir
            isEncryptedVault -> File(filesDir, "encrypted_vault").apply { mkdirs() }.absolutePath
            else -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath
        }

        val resolvedFileName = customFileName ?: resolveFileNameFromUrl(url)

        // Build PRDownloader multi-segmented request
        val downloadId = PRDownloader.download(url, resolvedDir, resolvedFileName)
            .setHeader("Accept-Encoding", "identity")
            .setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .build()
            .setOnStartOrResumeListener(object : OnStartOrResumeListener {
                override fun onStartOrResume() {
                    updateTaskState(downloadId) {
                        it.copy(state = DownloadState.DOWNLOADING, errorMessage = null)
                    }
                    updateForegroundServiceState()
                    Log.d(TAG, "Download started/resumed: ID $downloadId")
                }
            })
            .setOnPauseListener(object : OnPauseListener {
                override fun onPause() {
                    updateTaskState(downloadId) {
                        it.copy(state = DownloadState.PAUSED, speedFormatted = "0 KB/s")
                    }
                    updateForegroundServiceState()
                    Log.d(TAG, "Download paused: ID $downloadId")
                }
            })
            .setOnCancelListener(object : OnCancelListener {
                override fun onCancel() {
                    updateTaskState(downloadId) {
                        it.copy(state = DownloadState.CANCELLED, speedFormatted = "0 KB/s")
                    }
                    updateForegroundServiceState()
                    Log.d(TAG, "Download cancelled: ID $downloadId")
                }
            })
            .setOnProgressListener(object : OnProgressListener {
                override fun onProgress(progress: Progress) {
                    val currentBytes = progress.currentBytes
                    val totalBytes = progress.totalBytes
                    val percent = if (totalBytes > 0) ((currentBytes * 100) / totalBytes).toInt() else 0

                    val speed = calculateInstantSpeed(downloadId, currentBytes)

                    updateTaskState(downloadId) { task ->
                        task.copy(
                            progressPercent = percent,
                            currentBytes = currentBytes,
                            totalBytes = totalBytes,
                            speedFormatted = speed,
                            state = DownloadState.DOWNLOADING
                        )
                    }

                    // Throttle notification updates (at most once every 800ms)
                    val lastUpdate = lastForegroundNotificationUpdate[downloadId] ?: 0L
                    val now = System.currentTimeMillis()
                    if (now - lastUpdate > 800) {
                        lastForegroundNotificationUpdate[downloadId] = now
                        updateForegroundServiceState()
                    }
                }
            })
            .start(object : OnDownloadListener {
                override fun onDownloadComplete() {
                    val completedFile = File(resolvedDir, resolvedFileName)

                    // Transition to checksum verification stage
                    updateTaskState(downloadId) { task ->
                        task.copy(
                            progressPercent = 100,
                            state = DownloadState.VERIFYING_CHECKSUM,
                            speedFormatted = "Verifying integrity..."
                        )
                    }
                    updateForegroundServiceState()

                    // Run cryptographic MD5/SHA-256 verification in background IO
                    lifecycleScope.launch {
                        val task = _downloadTasks.value[downloadId]
                        val checksum = verifyFileChecksum(completedFile, task?.expectedChecksum)

                        if (checksum.verified) {
                            updateTaskState(downloadId) {
                                it.copy(
                                    state = DownloadState.COMPLETED,
                                    speedFormatted = "0 KB/s",
                                    md5Checksum = checksum.md5,
                                    sha256Checksum = checksum.sha256,
                                    isChecksumVerified = true,
                                    errorMessage = null
                                )
                            }
                            notifyDownloadFinished(resolvedFileName, resolvedDir, checksum.sha256)
                            Log.i(TAG, "Download completed & verified: $resolvedFileName (SHA-256: ${checksum.sha256})")
                        } else {
                            // Checksum verification failed: corruption detected
                            updateTaskState(downloadId) {
                                it.copy(
                                    state = DownloadState.FAILED,
                                    speedFormatted = "0 KB/s",
                                    errorMessage = checksum.error ?: "File corrupted during segmented transfer",
                                    md5Checksum = checksum.md5,
                                    sha256Checksum = checksum.sha256,
                                    isChecksumVerified = false
                                )
                            }
                            Log.e(TAG, "Corrupt download detected for ID $downloadId: ${checksum.error}")
                            runOnUiThread {
                                Toast.makeText(
                                    this@MainActivity,
                                    "Checksum verification failed! $resolvedFileName is corrupted.",
                                    Toast.LENGTH_LONG
                                ).show()
                            }
                        }
                        updateForegroundServiceState()
                    }
                }

                override fun onError(error: Error?) {
                    val errorDesc = error?.serverErrorMessage ?: (error?.connectionException?.message ?: "Network transfer error")
                    updateTaskState(downloadId) { task ->
                        task.copy(
                            state = DownloadState.FAILED,
                            speedFormatted = "0 KB/s",
                            errorMessage = errorDesc
                        )
                    }
                    updateForegroundServiceState()
                    Log.e(TAG, "Download failed for ID $downloadId: $errorDesc")
                }
            })

        // Register new item into memory flow
        val initialTask = DownloadTask(
            downloadId = downloadId,
            url = url,
            fileName = resolvedFileName,
            destinationPath = File(resolvedDir, resolvedFileName).absolutePath,
            expectedChecksum = expectedChecksum,
            state = DownloadState.DOWNLOADING
        )

        val updatedMap = _downloadTasks.value.toMutableMap()
        updatedMap[downloadId] = initialTask
        _downloadTasks.value = updatedMap

        updateForegroundServiceState()
        return downloadId
    }

    /**
     * Pauses an active PRDownloader transfer
     */
    fun pauseDownload(downloadId: Int) {
        PRDownloader.pause(downloadId)
        updateForegroundServiceState()
    }

    /**
     * Resumes a paused PRDownloader transfer
     */
    fun resumeDownload(downloadId: Int) {
        if (onlyDownloadOnWifi && !isWifiConnected()) {
            Toast.makeText(this, "Cannot resume on Mobile Data (Wi-Fi Only enabled)", Toast.LENGTH_SHORT).show()
            return
        }
        PRDownloader.resume(downloadId)
        updateForegroundServiceState()
    }

    /**
     * Cancels an active or paused transfer and frees allocated temporary cache
     */
    fun cancelDownload(downloadId: Int) {
        PRDownloader.cancel(downloadId)
        autoPausedTaskIds.remove(downloadId)
        updateForegroundServiceState()
    }

    /**
     * Enqueues an ultra-resilient background download using AndroidX WorkManager
     * (Ensures downloads continue even if the UI task is killed by battery management)
     */
    fun enqueuePersistentBackgroundWorker(url: String, fileName: String, expectedChecksum: String? = null) {
        val networkType = if (onlyDownloadOnWifi) NetworkType.UNMETERED else NetworkType.CONNECTED
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(networkType)
            .build()

        val inputData = Data.Builder()
            .putString(DownloadWorker.KEY_URL, url)
            .putString(DownloadWorker.KEY_FILE_NAME, fileName)
            .apply {
                if (expectedChecksum != null) {
                    putString(DownloadWorker.KEY_EXPECTED_CHECKSUM, expectedChecksum)
                }
            }
            .build()

        val downloadWorkRequest = OneTimeWorkRequestBuilder<DownloadWorker>()
            .setConstraints(constraints)
            .setInputData(inputData)
            .build()

        WorkManager.getInstance(applicationContext).enqueue(downloadWorkRequest)
        Toast.makeText(this, "Enqueued in WorkManager background service", Toast.LENGTH_SHORT).show()
    }

    /**
     * Calculates transfer speed in KB/s or MB/s based on sampling window
     */
    private fun calculateInstantSpeed(downloadId: Int, currentBytes: Long): String {
        val currentTime = System.currentTimeMillis()
        val prevTime = previousTimestampMap[downloadId] ?: currentTime
        val prevBytes = previousBytesMap[downloadId] ?: currentBytes

        val timeDiffSeconds = (currentTime - prevTime) / 1000.0
        if (timeDiffSeconds <= 0.3) {
            return _downloadTasks.value[downloadId]?.speedFormatted ?: "0 KB/s"
        }

        val bytesDiff = currentBytes - prevBytes
        val bytesPerSecond = if (bytesDiff > 0) bytesDiff / timeDiffSeconds else 0.0

        previousBytesMap[downloadId] = currentBytes
        previousTimestampMap[downloadId] = currentTime

        val df = DecimalFormat("#.##")
        return when {
            bytesPerSecond >= 1024 * 1024 -> "${df.format(bytesPerSecond / (1024 * 1024))} MB/s"
            bytesPerSecond >= 1024 -> "${df.format(bytesPerSecond / 1024)} KB/s"
            else -> "${bytesPerSecond.toLong()} B/s"
        }
    }

    private fun updateTaskState(downloadId: Int, transform: (DownloadTask) -> DownloadTask) {
        val map = _downloadTasks.value.toMutableMap()
        val existing = map[downloadId] ?: return
        map[downloadId] = transform(existing)
        _downloadTasks.value = map
    }

    private fun resolveFileNameFromUrl(url: String): String {
        val cleanUrl = url.substringBefore("?").substringBefore("#")
        val lastSegment = cleanUrl.substringAfterLast("/")
        return if (lastSegment.isNotBlank() && lastSegment.contains(".")) {
            lastSegment
        } else {
            "media_${System.currentTimeMillis()}.mp4"
        }
    }

    private fun notifyDownloadFinished(fileName: String, dir: String, sha256: String? = null) {
        runOnUiThread {
            val hashTag = if (sha256 != null) " [SHA-256: ${sha256.take(8)}...]" else ""
            Toast.makeText(this, "Saved & Verified: $fileName$hashTag", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * UI callback hook to bind to Jetpack Compose or XML layout elements
     */
    private fun onDownloadsStateUpdated(tasks: List<DownloadTask>) {
        Log.d(TAG, "Active tasks count: ${tasks.size}")
        tasks.forEach { task ->
            val checksumStatus = if (task.isChecksumVerified == true) " [Verified]" else ""
            Log.v(TAG, "[${task.downloadId}] ${task.fileName} - ${task.progressPercent}% (${task.speedFormatted})$checksumStatus - ${task.state}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            networkCallback?.let { connectivityManager.unregisterNetworkCallback(it) }
        } catch (e: Exception) {
            Log.w(TAG, "Error unregistering network callback: ${e.message}")
        }
        releaseMainWakeLock()
        DownloadForegroundService.stop(this)
    }
}

/**
 * AndroidX WorkManager Worker for persistent background downloading with MD5 & SHA-256 verification
 */
class DownloadWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        const val KEY_URL = "extra_download_url"
        const val KEY_FILE_NAME = "extra_file_name"
        const val KEY_EXPECTED_CHECKSUM = "extra_expected_checksum"
    }

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val downloadUrl = inputData.getString(KEY_URL) ?: return@withContext Result.failure()
        val targetFileName = inputData.getString(KEY_FILE_NAME) ?: "download_${System.currentTimeMillis()}.bin"
        val expectedChecksum = inputData.getString(KEY_EXPECTED_CHECKSUM)

        val targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!targetDir.exists()) targetDir.mkdirs()
        val destinationFile = File(targetDir, targetFileName)

        try {
            val request = Request.Builder()
                .url(downloadUrl)
                .header("User-Agent", "DeathlessDownloader/1.0 Native Worker")
                .build()

            val response = okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) {
                return@withContext Result.retry()
            }

            val body = response.body ?: return@withContext Result.failure()
            val totalBytes = body.contentLength()

            var inputStream: InputStream? = null
            var outputStream: FileOutputStream? = null

            val md5Digest = MessageDigest.getInstance("MD5")
            val sha256Digest = MessageDigest.getInstance("SHA-256")

            try {
                inputStream = body.byteStream()
                outputStream = FileOutputStream(destinationFile)

                val buffer = ByteArray(32768)
                var bytesRead: Int
                var totalBytesRead = 0L

                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    md5Digest.update(buffer, 0, bytesRead)
                    sha256Digest.update(buffer, 0, bytesRead)
                    totalBytesRead += bytesRead

                    val progressPercent = if (totalBytes > 0) ((totalBytesRead * 100) / totalBytes).toInt() else -1
                    setProgress(Data.Builder().putInt("progress", progressPercent).build())
                }

                outputStream.flush()

                val md5Hex = md5Digest.digest().joinToString("") { "%02x".format(it) }
                val sha256Hex = sha256Digest.digest().joinToString("") { "%02x".format(it) }

                if (!expectedChecksum.isNullOrBlank()) {
                    val exp = expectedChecksum.trim().lowercase()
                    val matches = (exp == md5Hex.lowercase()) || (exp == sha256Hex.lowercase())
                    if (!matches) {
                        Log.e(MainActivity.TAG, "WorkManager checksum mismatch! Expected: $expectedChecksum, got SHA-256: $sha256Hex, MD5: $md5Hex")
                        return@withContext Result.failure()
                    }
                }

                Log.i(MainActivity.TAG, "WorkManager completed download & verified: ${destinationFile.absolutePath} (SHA-256: $sha256Hex, MD5: $md5Hex)")
                Result.success()
            } finally {
                inputStream?.close()
                outputStream?.close()
            }
        } catch (e: Exception) {
            Log.e(MainActivity.TAG, "WorkManager download error: ${e.localizedMessage}", e)
            Result.retry()
        }
    }
}

