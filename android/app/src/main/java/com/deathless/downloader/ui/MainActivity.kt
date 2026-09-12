package com.deathless.downloader.ui

import android.Manifest
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import com.deathless.downloader.R
import com.deathless.downloader.data.model.DownloadStatus
import com.deathless.downloader.data.model.DownloadTask
import com.deathless.downloader.databinding.ActivityMainBinding
import com.deathless.downloader.ui.adapter.DownloadAdapter
import com.deathless.downloader.ui.viewmodel.MainViewModel
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: MainViewModel by viewModels()
    private lateinit var downloadAdapter: DownloadAdapter

    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
            if (!isGranted) {
                Toast.makeText(this, "Notification permission required to display download progress", Toast.LENGTH_SHORT).show()
            }
        }

    private val requestStoragePermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
            if (!isGranted) {
                Toast.makeText(this, "Storage permission required to save files on older Android versions", Toast.LENGTH_SHORT).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupRecyclerView()
        setupListeners()
        observeViewModel()
        checkPermissions()
        handleSharedIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleSharedIntent(intent)
    }

    private fun setupRecyclerView() {
        downloadAdapter = DownloadAdapter(
            onPauseResumeClick = { task ->
                when (task.status) {
                    DownloadStatus.DOWNLOADING, DownloadStatus.CONNECTING -> {
                        viewModel.pauseDownload(task.id)
                    }
                    DownloadStatus.PAUSED -> {
                        viewModel.resumeDownload(task.id)
                    }
                    DownloadStatus.FAILED -> {
                        viewModel.retryDownload(task.id)
                    }
                    else -> Unit
                }
            },
            onCancelDeleteClick = { task ->
                if (task.status == DownloadStatus.DOWNLOADING || task.status == DownloadStatus.PAUSED) {
                    viewModel.cancelDownload(task.id)
                } else {
                    viewModel.deleteTask(task.id)
                }
            },
            onOpenFileClick = { task ->
                openDownloadedMedia(task)
            }
        )

        binding.rvDownloads.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = downloadAdapter
            itemAnimator = null // Avoid flicker during rapid progress updates
        }
    }

    private fun setupListeners() {
        // Paste button
        binding.btnPaste.setOnClickListener {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = clipboard.primaryClip
            if (clip != null && clip.itemCount > 0) {
                val text = clip.getItemAt(0).text?.toString() ?: ""
                binding.etUrl.setText(text)
                binding.etUrl.setSelection(binding.etUrl.text?.length ?: 0)
            } else {
                Toast.makeText(this, "Clipboard is empty", Toast.LENGTH_SHORT).show()
            }
        }

        // Start Download button
        binding.btnStartDownload.setOnClickListener {
            val url = binding.etUrl.text?.toString() ?: ""
            val isAudioOnly = binding.chipAudio.isChecked
            viewModel.submitUrl(url, isAudioOnly)
            binding.etUrl.text?.clear()
        }

        // Clear Completed button
        binding.btnClearCompleted.setOnClickListener {
            viewModel.clearCompleted()
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    viewModel.tasks.collectLatest { list ->
                        downloadAdapter.submitList(list)
                        val hasItems = list.isNotEmpty()
                        binding.rvDownloads.visibility = if (hasItems) View.VISIBLE else View.GONE
                        binding.layoutEmptyState.visibility = if (hasItems) View.GONE else View.VISIBLE

                        val hasCompleted = list.any { it.status == DownloadStatus.COMPLETED }
                        binding.btnClearCompleted.visibility = if (hasCompleted) View.VISIBLE else View.GONE
                        binding.tvSectionTitle.text = "Downloads (${list.size})"
                    }
                }

                launch {
                    viewModel.totalSpeedMbps.collectLatest { speedMbps ->
                        if (speedMbps > 0.05) {
                            binding.tvHeaderSpeed.visibility = View.VISIBLE
                            binding.tvHeaderSpeed.text = String.format("%.1f MB/s", speedMbps)
                        } else {
                            binding.tvHeaderSpeed.visibility = View.GONE
                        }
                    }
                }

                launch {
                    viewModel.uiEvent.collectLatest { message ->
                        Snackbar.make(binding.root, message, Snackbar.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun checkPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestStoragePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }
    }

    private fun handleSharedIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (!sharedText.isNullOrBlank()) {
                val urlMatch = extractUrl(sharedText)
                if (urlMatch != null) {
                    binding.etUrl.setText(urlMatch)
                    Toast.makeText(this, "URL received from share", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun extractUrl(text: String): String? {
        val words = text.split("\\s+".toRegex())
        return words.firstOrNull { it.startsWith("http://") || it.startsWith("https://") }
    }

    private fun openDownloadedMedia(task: DownloadTask) {
        val file = File(task.destinationPath)
        if (!file.exists()) {
            Toast.makeText(this, "File not found at: ${task.destinationPath}", Toast.LENGTH_LONG).show()
            return
        }

        try {
            val uri: Uri = FileProvider.getUriForFile(
                this,
                "${applicationContext.packageName}.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, task.mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            val chooser = Intent.createChooser(intent, "Open with")
            startActivity(chooser)
        } catch (e: Exception) {
            Toast.makeText(this, "Cannot open file: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}
