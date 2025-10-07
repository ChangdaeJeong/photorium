document.addEventListener('DOMContentLoaded', () => {
    // Main page elements
    const folderListDiv = document.getElementById('folder-list');
    const galleryLinkCard = document.getElementById('gallery-link-card');

    // Modal elements
    const modal = document.getElementById('folder-browser-modal');
    const openBrowserBtn = document.getElementById('open-browser-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const pathDisplay = document.querySelector('.current-path-display');
    const directoryList = document.querySelector('.directory-list');
    const showHiddenToggle = document.getElementById('show-hidden-toggle');
    const driveSelector = document.getElementById('drive-selector');

    // Settings elements
    const gridSizeSlider = document.getElementById('grid-size-slider');
    const gridSizeValue = document.getElementById('grid-size-value');

    let currentPath = null;

    // Create a single thumbnail preview element to be reused
    const thumbnailPreview = document.createElement('div');
    thumbnailPreview.id = 'thumbnail-preview';
    document.body.appendChild(thumbnailPreview);

    // --- Folder Browser Logic ---

    async function browse(path = null) {
        try {
            directoryList.innerHTML = `<li>Loading...</li>`;
            const showHidden = showHiddenToggle.checked;
            const response = await fetch('/api/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path, show_hidden: showHidden }),
            });
            if (!response.ok) throw new Error('Server error.');
            
            const data = await response.json();
            currentPath = data.current_path;
            
            // Update path display with media counts
            pathDisplay.innerHTML = `<span>Current: ${currentPath}</span>`;
            const countsWrapper = document.createElement('span');
            countsWrapper.className = 'current-path-counts';

            if (data.current_image_count > 0) {
                const imageSpan = document.createElement('span');
                imageSpan.className = 'media-count image-count';
                imageSpan.textContent = data.current_image_count;
                imageSpan.title = `Images: ${data.current_image_count}`;
                countsWrapper.appendChild(imageSpan);
            }
            if (data.current_video_count > 0) {
                const videoSpan = document.createElement('span');
                videoSpan.className = 'media-count video-count';
                videoSpan.textContent = data.current_video_count;
                videoSpan.title = `Videos: ${data.current_video_count}`;
                countsWrapper.appendChild(videoSpan);
            }
            pathDisplay.appendChild(countsWrapper);

            directoryList.innerHTML = '';

            // Add ".." to go to parent directory
            if (data.parent_path) {
                const parentItem = document.createElement('li');
                parentItem.textContent = `.. (Go back)`;
                parentItem.dataset.path = data.parent_path;
                parentItem.classList.add('nav-item', 'back-item');
                directoryList.appendChild(parentItem);
            }

            data.directories.forEach(dir => {
                const item = document.createElement('li');
                const dirName = dir.name;
                const imageCount = dir.image_count;
                const videoCount = dir.video_count;

                let countsHtml = '';
                if (imageCount > 0) {
                    countsHtml += `<span class="media-count image-count">${imageCount}</span>`;
                }
                if (videoCount > 0) {
                    countsHtml += `<span class="media-count video-count">${videoCount}</span>`;
                }

                item.innerHTML = `${dirName} <span class="counts-wrapper">${countsHtml}</span>`;
                item.dataset.path = `${currentPath}${currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\'}${dirName}`;
                directoryList.appendChild(item);
            });

            // Add files to the list
            data.files.forEach(file => {
                const item = document.createElement('li');
                const fullPath = `${currentPath}${currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\'}${file}`;
                
                // Unicode-safe Base64 encoding
                // 1. encodeURIComponent to handle non-Latin1 chars
                // 2. unescape to convert %xx to characters
                // 3. btoa to encode
                const encodedPath = btoa(unescape(encodeURIComponent(fullPath)));

                item.textContent = file;
                item.classList.add('file-item'); // Add class for styling
                item.dataset.encodedPath = encodedPath;

                const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv'].some(ext => file.toLowerCase().endsWith(ext));
                if (isVideo) {
                    item.classList.add('video-file');
                } else {
                    item.classList.add('image-file');
                }

                directoryList.appendChild(item);
            });
        } catch (error) {
            directoryList.innerHTML = `<li class="error">Error: ${error.message}</li>`;
        }
    }

    async function loadDrives() {
        try {
            const response = await fetch('/api/drives');
            const drives = await response.json();
            driveSelector.innerHTML = '';
            drives.forEach(drive => {
                const btn = document.createElement('button');
                btn.textContent = drive.replace('\\', '');
                btn.title = `Go to ${drive}`;
                btn.addEventListener('click', () => browse(drive));
                driveSelector.appendChild(btn);
            });
        } catch (error) {
            console.error('Failed to load drives:', error);
        }
    }

    openBrowserBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        if (!currentPath) loadDrives(); // Load drives only on first open
        browse(); // Start at default path (Desktop)
    });

    closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });

    directoryList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI' && e.target.dataset.path) {
            browse(e.target.dataset.path);
        }
    });

    // Refresh directory list when toggle is changed
    showHiddenToggle.addEventListener('change', () => {
        browse(currentPath);
    });

    // Thumbnail preview events
    directoryList.addEventListener('mouseover', (e) => {
        const target = e.target;
        if (target.tagName === 'LI' && target.classList.contains('file-item')) {
            const encodedPath = target.dataset.encodedPath;
            let previewContent = '';

            if (target.classList.contains('image-file')) {
                const img = new Image();
                img.src = `/api/thumbnail/${encodedPath}`;
                img.alt = 'preview';
                
                // When the image is loaded, adjust the container size
                img.onload = () => {
                    thumbnailPreview.style.width = `${img.naturalWidth}px`;
                    thumbnailPreview.style.height = `${img.naturalHeight}px`;
                };
                previewContent = img.outerHTML;

            } else if (target.classList.contains('video-file')) {
                previewContent = `<div class="video-icon">🎬</div>`;
                // Reset to a fixed size for the video icon
                thumbnailPreview.style.width = '150px';
                thumbnailPreview.style.height = '150px';
            }

            thumbnailPreview.innerHTML = previewContent;
            thumbnailPreview.style.display = 'flex';
            thumbnailPreview.style.alignItems = 'center';
            thumbnailPreview.style.justifyContent = 'center';
        }
    });

    directoryList.addEventListener('mouseout', () => thumbnailPreview.style.display = 'none');
    directoryList.addEventListener('mousemove', (e) => {
        if (thumbnailPreview.style.display !== 'none') {
            thumbnailPreview.style.left = `${e.pageX + 15}px`;
            thumbnailPreview.style.top = `${e.pageY + 15}px`;
        }
    });

    selectFolderBtn.addEventListener('click', async () => {
        if (!currentPath) return;
        await addFolder(currentPath);
        modal.style.display = 'none';
    });

    // --- Main Page Logic ---

    function showToast(message, type = 'success') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 5000); // Toast disappears after 5 seconds
    }

    async function addFolder(path) {
        try {
            const response = await fetch('/api/add_folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path }),
            });
            const result = await response.json();
            if (result.success) {
                showToast(`Successfully added: ${result.path}`, 'success');
                loadFolders();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        }
    }

    async function deleteFolder(path) {
        try {
            const response = await fetch('/api/delete_folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path }),
            });
            const result = await response.json();
            if (result.success) {
                showToast(`Successfully removed: ${path}`, 'success');
                loadFolders();
            } else {
                throw new Error(result.error || 'Failed to delete folder.');
            }
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        }
    }
    async function loadFolders() {
        try {
            const response = await fetch('/api/folders');
            if (!response.ok) throw new Error('Failed to fetch folders.');
            const folders = await response.json();
            
            folderListDiv.innerHTML = '';
            if (folders.length === 0) {
                folderListDiv.innerHTML = `<p>No folders added yet. Add a folder to get started!</p>`;
                galleryLinkCard.style.display = 'none';
            } else {
                const list = document.createElement('ul');
                folders.forEach(folder => {
                    const item = document.createElement('li');
                    item.dataset.path = folder.path;

                    const date = new Date(folder.added_on * 1000);
                    const dateString = date.toLocaleDateString();

                    const textSpan = `<span>
                        <strong>${folder.path}</strong><br>
                        <small>Added: ${dateString} | Total Media: ${folder.media_count}</small>
                    </span>`;
                    const deleteBtn = `<button class="delete-btn" title="Remove folder">🗑️</button>`;
                    item.innerHTML = textSpan + deleteBtn;
                    list.appendChild(item);
                });
                folderListDiv.appendChild(list);
                galleryLinkCard.style.display = 'block';
            }
        } catch (error) {
            folderListDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    }

    folderListDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const path = e.target.parentElement.dataset.path;
            if (confirm(`Are you sure you want to remove this collection?\n\n${path}\n\n(This will not delete the folder from your computer.)`)) {
                deleteFolder(path);
            }
        }
    });

    // --- Settings Logic ---
    async function loadSettings() {
        try {
            const response = await fetch('/api/settings');
            const settings = await response.json();
            if (gridSizeSlider) {
                gridSizeSlider.value = settings.gallery_grid_size;
                gridSizeValue.textContent = `${settings.gallery_grid_size}px`;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async function saveSetting(key, value) {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value }),
            });
        } catch (error) {
            console.error('Failed to save setting:', error);
        }
    }

    if (gridSizeSlider) {
        gridSizeSlider.addEventListener('input', (e) => {
            const newSize = e.target.value;
            gridSizeValue.textContent = `${newSize}px`;
            saveSetting('gallery_grid_size', parseInt(newSize, 10));
        });
    }

    // Initial Loads
    loadSettings();
    loadFolders();
});
