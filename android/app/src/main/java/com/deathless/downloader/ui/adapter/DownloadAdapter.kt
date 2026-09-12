package com.deathless.downloader.ui.adapter

import android.content.res.ColorStateList
import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.deathless.downloader.R
import com.deathless.downloader.data.model.DownloadStatus
import com.deathless.downloader.data.model.DownloadTask
import com.deathless.downloader.databinding.ItemDownloadBinding

class DownloadAdapter(
    private val onPauseResumeClick: (DownloadTask) -> Unit,
    private val onCancelDeleteClick: (DownloadTask) -> Unit,
    private val onOpenFileClick: (DownloadTask) -> Unit
) : ListAdapter<DownloadTask, DownloadAdapter.DownloadViewHolder>(TaskDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DownloadViewHolder {
        val binding = ItemDownloadBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return DownloadViewHolder(binding)
    }

    override fun onBindViewHolder(holder: DownloadViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class DownloadViewHolder(private val binding: ItemDownloadBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(task: DownloadTask) {
            binding.tvTitle.text = task.title

            // Icon by media type
            if (task.isAudioOnly) {
                binding.ivMediaType.setImageResource(android.R.drawable.ic_media_play)
                binding.ivMediaType.imageTintList = ColorStateList.valueOf(Color.parseColor("#10B981"))
            } else {
                binding.ivMediaType.setImageResource(android.R.drawable.ic_menu_slideshow)
                binding.ivMediaType.imageTintList = ColorStateList.valueOf(Color.parseColor("#06B6D4"))
            }

            // Status Badge & Colors
            when (task.status) {
                DownloadStatus.QUEUED -> {
                    binding.tvStatusBadge.text = "QUEUED"
                    binding.tvStatusBadge.setTextColor(Color.parseColor("#94A3B8"))
                    binding.progressBar.isIndeterminate = true
                }
                DownloadStatus.CONNECTING -> {
                    binding.tvStatusBadge.text = "CONNECTING"
                    binding.tvStatusBadge.setTextColor(Color.parseColor("#06B6D4"))
                    binding.progressBar.isIndeterminate = true
                }
                DownloadStatus.DOWNLOADING -> {
                    binding.tvStatusBadge.text = "DOWNLOADING"
                    binding.tvStatusBadge.setTextColor(Color.parseColor("#06B6D4"))
                    binding.progressBar.isIndeterminate = false
                    binding.progressBar.progress = task.progress
                }
                DownloadStatus.PAUSED -> {
                    binding.tvStatusBadge.text = "PAUSED"
                    binding.tvStatusBadge.setTextColor(Color.parseColor("#F59E0B"))
                    binding.progressBar.isIndeterminate = false
                    binding.progressBar.progress = task.progress
                }
                DownloadStatus.COMPLETED -> {
                    binding.tvStatusBadge.text = "COMPLETED"
                    binding.tvStatusBadge.setTextColor(Color.parseColor("#10B981"))
                    binding.progressBar.isIndeterminate = false
                    binding.progressBar.progress = 100
                }
                DownloadStatus.FAILED -> {
                    binding.tvStatusBadge.text = "FAILED"
                    binding.tvStatusBadge.setTextColor(Color.parseColor("#EF4444"))
                    binding.progressBar.isIndeterminate = false
                }
                DownloadStatus.CANCELLED -> {
                    binding.tvStatusBadge.text = "CANCELLED"
                    binding.tvStatusBadge.setTextColor(Color.parseColor("#64748B"))
                    binding.progressBar.isIndeterminate = false
                }
            }

            // Progress text: Size, Speed, ETA
            val downloadedMb = task.downloadedBytes / (1024.0 * 1024.0)
            val totalMb = task.fileSize / (1024.0 * 1024.0)
            val speedMb = task.speedBytesPerSec / (1024.0 * 1024.0)

            binding.tvProgressDetails.text = when (task.status) {
                DownloadStatus.DOWNLOADING -> {
                    if (task.fileSize > 0) {
                        String.format(
                            "%d%% • %.1f / %.1f MB • %.1f MB/s • ETA: %ds",
                            task.progress,
                            downloadedMb,
                            totalMb,
                            speedMb,
                            task.etaSeconds
                        )
                    } else {
                        String.format("%.1f MB downloaded • %.1f MB/s", downloadedMb, speedMb)
                    }
                }
                DownloadStatus.PAUSED -> {
                    String.format("Paused at %d%% (%.1f / %.1f MB)", task.progress, downloadedMb, totalMb)
                }
                DownloadStatus.COMPLETED -> {
                    String.format("100%% • Finished (%.1f MB)", downloadedMb)
                }
                DownloadStatus.FAILED -> {
                    task.errorMessage ?: "Download failed"
                }
                DownloadStatus.QUEUED, DownloadStatus.CONNECTING -> {
                    "Establishing multi-threaded stream..."
                }
                DownloadStatus.CANCELLED -> {
                    "Download cancelled by user"
                }
            }

            // Button controls
            when (task.status) {
                DownloadStatus.DOWNLOADING, DownloadStatus.CONNECTING -> {
                    binding.btnPauseResume.visibility = View.VISIBLE
                    binding.btnPauseResume.setImageResource(android.R.drawable.ic_media_pause)
                    binding.btnPauseResume.imageTintList = ColorStateList.valueOf(Color.parseColor("#06B6D4"))
                    binding.btnOpenFile.visibility = View.GONE
                }
                DownloadStatus.PAUSED -> {
                    binding.btnPauseResume.visibility = View.VISIBLE
                    binding.btnPauseResume.setImageResource(android.R.drawable.ic_media_play)
                    binding.btnPauseResume.imageTintList = ColorStateList.valueOf(Color.parseColor("#F59E0B"))
                    binding.btnOpenFile.visibility = View.GONE
                }
                DownloadStatus.FAILED -> {
                    binding.btnPauseResume.visibility = View.VISIBLE
                    binding.btnPauseResume.setImageResource(android.R.drawable.ic_menu_rotate)
                    binding.btnPauseResume.imageTintList = ColorStateList.valueOf(Color.parseColor("#EF4444"))
                    binding.btnOpenFile.visibility = View.GONE
                }
                DownloadStatus.COMPLETED -> {
                    binding.btnPauseResume.visibility = View.GONE
                    binding.btnOpenFile.visibility = View.VISIBLE
                }
                else -> {
                    binding.btnPauseResume.visibility = View.GONE
                    binding.btnOpenFile.visibility = View.GONE
                }
            }

            // Click listeners
            binding.btnPauseResume.setOnClickListener {
                onPauseResumeClick(task)
            }

            binding.btnCancelDelete.setOnClickListener {
                onCancelDeleteClick(task)
            }

            binding.btnOpenFile.setOnClickListener {
                onOpenFileClick(task)
            }
        }
    }

    private class TaskDiffCallback : DiffUtil.ItemCallback<DownloadTask>() {
        override fun areItemsTheSame(oldItem: DownloadTask, newItem: DownloadTask): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: DownloadTask, newItem: DownloadTask): Boolean {
            return oldItem == newItem
        }
    }
}
