document.addEventListener('DOMContentLoaded', () => {
    const galleryGrid = document.getElementById('image-gallery-grid');
    const modal = document.getElementById('image-modal');
    const galleryStats = document.getElementById('gallery-stats');
    if (!galleryGrid || !modal) return;

    // Create modal content dynamically
    modal.innerHTML = `
        <span class="close-button">&times;</span>
        <span class="prev-button">&lt;</span>
        <span class="next-button">&gt;</span>
        <div id="modal-media-wrapper">
            <img id="modal-image" class="modal-content" style="display: none;">
            <video id="modal-video" class="modal-content" controls style="display: none;"></video>
        </div>
        <div id="modal-controls" class="modal-controls">
            <button id="zoom-out-btn" title="Zoom Out">-</button>
            <button id="zoom-in-btn" title="Zoom In">+</button>
            <button id="fit-screen-btn" title="Fit to Screen">Fit</button>
        </div>
    `;

    const modalImage = document.getElementById('modal-image');
    const modalVideo = document.getElementById('modal-video');
    const closeModalBtn = modal.querySelector('.close-button');
    const prevBtn = modal.querySelector('.prev-button');
    const nextBtn = modal.querySelector('.next-button');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const fitScreenBtn = document.getElementById('fit-screen-btn');
    const controlsPanel = document.getElementById('modal-controls');

    let allImages = [];
    let currentIndex = 0;
    let scale = 1, isDragging = false, startX, startY, translateX, translateY;

    // --- Floating Date Indicator ---
    const dateIndicator = document.createElement('div');
    dateIndicator.id = 'gallery-date-indicator';
    document.body.appendChild(dateIndicator);
    let scrollTimeout;

    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            const img = entry.target;
            if (entry.isIntersecting) {
                // Image is entering the viewport, load it.
                img.src = img.dataset.src;
                img.classList.remove('lazy');
            } else {
                // Image is leaving the viewport, unload it to save memory.
                // We check if it has a data-src to ensure we don't unload images
                // that were never loaded in the first place.
                if (img.dataset.src) {
                    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                    img.classList.add('lazy');
                }
            }
        });
    }, { rootMargin: "200px" }); // Use a margin to avoid flickering on fast scrolls

    async function loadImages() {
        try {
            const response = await fetch('/api/images');
            if (!response.ok) throw new Error('Failed to load images.');
            allImages = await response.json();

            galleryGrid.innerHTML = ''; // Clear previous content
            if (allImages.length === 0) {
                galleryGrid.innerHTML = '<p>No images found in your collections.</p>';
                return;
            }

            // --- Calculate and Display Stats ---
            const totalImages = allImages.filter(m => m.type === 'image').length;
            const totalVideos = allImages.filter(m => m.type === 'video').length;
            if (galleryStats) {
                galleryStats.textContent = `Total: ${totalImages} images, ${totalVideos} videos`;
            }

            // --- Group images by month ---
            const imagesByMonth = allImages.reduce((acc, image) => {
                const date = new Date(image.mtime * 1000);
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!acc[key]) {
                    acc[key] = [];
                }
                acc[key].push(image);
                return acc;
            }, {});

            // --- Render grid with separators ---
            for (const monthKey in imagesByMonth) {
                const monthImages = imagesByMonth[monthKey];
                const firstImageDate = new Date(monthImages[0].mtime * 1000);
                const monthName = firstImageDate.toLocaleString('default', { month: 'long' });
                const year = firstImageDate.getFullYear();

                const monthImageCount = monthImages.filter(m => m.type === 'image').length;
                const monthVideoCount = monthImages.filter(m => m.type === 'video').length;

                const separator = document.createElement('h2');
                separator.className = 'gallery-date-separator';
                separator.innerHTML = `${year} ${monthName} <span class="separator-count">(${monthImageCount} images, ${monthVideoCount} videos)</span>`;
                galleryGrid.appendChild(separator);

                monthImages.forEach(imageObject => {
                    const itemWrapper = document.createElement('div');
                    itemWrapper.className = 'grid-item-wrapper';

                    const img = document.createElement('img');
                    img.dataset.index = allImages.indexOf(imageObject);
                    img.classList.add('lazy');

                    if (imageObject.type === 'video') {
                        const videoIcon = document.createElement('span');
                        videoIcon.className = 'media-type-icon';
                        videoIcon.textContent = '▶';
                        itemWrapper.appendChild(videoIcon);
                        itemWrapper.classList.add('video-item');
                    }

                    const thumbnailUrl = imageObject.src.replace('/image/', '/api/thumbnail/');
                    img.dataset.src = thumbnailUrl;
                    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

                    itemWrapper.appendChild(img);
                    galleryGrid.appendChild(itemWrapper);
                    imageObserver.observe(img);
                });
            }
        } catch (error) {
            galleryGrid.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    }

    // --- Grid Zoom Logic --- 
    function updateGridSize(size) {
        // Set a CSS variable for item size and update the column layout
        galleryGrid.style.setProperty('--grid-item-size', `${size}px`);
        galleryGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(var(--grid-item-size, 120px), 1fr))`;
    }

    function showImage(index) {
        if (index < 0) index = allImages.length - 1; // Loop to last image
        if (index >= allImages.length) index = 0;

        // If EXIF overlay is open, close it before showing the next image.
        const existingOverlay = modal.querySelector('.exif-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        currentIndex = index;
        const currentMedia = allImages[currentIndex];

        // Hide both and reset
        modalImage.style.display = 'none';
        modalVideo.style.display = 'none';
        modalVideo.pause();
        modalVideo.src = '';

        if (currentMedia.type === 'image') {
            modalImage.style.opacity = 0; // Fade out
            // Preload image to get dimensions
            const img = new Image();
            img.src = currentMedia.src;
            img.onload = () => {
                modalImage.src = img.src;
                modalImage.style.display = 'block';
                fitToScreen();
                // For small images, give them a minimum size
                const minWidth = window.innerWidth * 0.5;
                if (img.naturalWidth < minWidth) {
                    modalImage.style.width = `${minWidth}px`;
                }
                modalImage.style.opacity = 1; // Fade in
            };
        } else if (currentMedia.type === 'video') {
            modalVideo.src = currentMedia.src;
            modalVideo.style.display = 'block';
            fitToScreen(); // Reset transform for video as well
        }

        loadAndDisplayMetadata();
        if (modal.style.display !== 'flex') modal.style.display = 'flex';
    }

    galleryGrid.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.grid-item-wrapper');
        if (wrapper && e.target.tagName === 'IMG') {
            const index = parseInt(e.target.dataset.index, 10);
            showImage(index);
        }
    });

    // --- Scroll Event for Date Indicator ---
    function handleScroll() {
        const separators = Array.from(galleryGrid.querySelectorAll('.gallery-date-separator'));
        let currentSeparator = null;

        // Find the last separator that is above the viewport's middle
        const viewportTop = 80; // A small offset from the top
        for (const separator of separators) {
            if (separator.getBoundingClientRect().top <= viewportTop) {
                currentSeparator = separator;
            } else {
                break; // Separators are sorted, so we can stop
            }
        }

        if (currentSeparator) {
            dateIndicator.textContent = currentSeparator.textContent;
            dateIndicator.classList.add('visible');

            // Hide the indicator after a delay
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                dateIndicator.classList.remove('visible');
            }, 800);
        }
    }

    let isScrolling = false;
    window.addEventListener('scroll', () => {
        if (!isScrolling) {
            window.requestAnimationFrame(() => {
                handleScroll();
                isScrolling = false;
            });
            isScrolling = true;
        }
    }, { passive: true });

    function closeModal() {
        modal.style.display = 'none';
        modalVideo.pause();
        modalVideo.src = '';
        modalImage.src = ''; // Free up memory
        // Also remove the EXIF overlay if it's open
        const existingOverlay = modal.querySelector('.exif-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        fitToScreen();
    }

    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    function updateZoom(newScale) {
        scale = Math.max(0.2, newScale); // Set a minimum scale
        const mediaElement = modalImage.style.display === 'block' ? modalImage : modalVideo;
        mediaElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    function fitToScreen() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        [modalImage, modalVideo].forEach(el => {
            el.style.width = '';
            el.style.height = '';
            el.style.transform = 'translate(0, 0) scale(1)';
        });
    }

    async function loadAndDisplayMetadata() {
        const currentImage = allImages[currentIndex];
        if (!currentImage) return;

        // Clear previous controls except for buttons
        controlsPanel.querySelectorAll('.modal-info-panel').forEach(el => el.remove());

        // Create a placeholder
        const infoPanel = document.createElement('div');
        infoPanel.className = 'modal-info-panel';
        infoPanel.innerHTML = `<span>${currentImage.filename}</span><span>Loading details...</span>`;
        controlsPanel.insertBefore(infoPanel, controlsPanel.firstChild);

        try {
            const response = await fetch(`/api/metadata/${currentImage.encoded_path}`);
            if (!response.ok) {
                throw new Error('Failed to fetch metadata');
            }
            const metadata = await response.json();

            // Update the info panel with the fetched data
            let infoHtml = `<span>${currentImage.filename} (${metadata.width}x${metadata.height})</span>`;
            
            // Only show the second line for images
            if (currentImage.type === 'image') {
                infoHtml += `<span>${metadata.model || 'N/A'} | ${metadata.location || 'No Location'} <button class="details-btn">Details</button></span>`;
            }
            infoPanel.innerHTML = infoHtml;

            const detailsBtn = infoPanel.querySelector('.details-btn');
            if (detailsBtn) {
                detailsBtn.addEventListener('click', () => showExifDetails(currentImage.encoded_path));
            }
        } catch (error) {
            infoPanel.innerHTML = `<span>${currentImage.filename}</span><span>Could not load details.</span>`;
        }
    }

    async function showExifDetails(encodedPath) {
        const overlay = document.createElement('div');
        overlay.className = 'exif-overlay';
        overlay.innerHTML = `<div class="exif-content"><pre>Loading...</pre></div>`;
        modal.appendChild(overlay);

        overlay.addEventListener('click', () => overlay.remove());

        try {
            const response = await fetch(`/api/exif/${encodedPath}`);
            const data = await response.json();
            const pre = overlay.querySelector('pre');
            pre.textContent = JSON.stringify(data, null, 2);
        } catch (error) {
            const pre = overlay.querySelector('pre');
            pre.textContent = `Error loading details: ${error.message}`;
        }
    }

    zoomInBtn.addEventListener('click', () => updateZoom(scale * 1.2));
    zoomOutBtn.addEventListener('click', () => updateZoom(scale / 1.2));
    fitScreenBtn.addEventListener('click', fitToScreen);

    const mediaWrapper = document.getElementById('modal-media-wrapper');

    mediaWrapper.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left-click
        e.preventDefault();
        isDragging = true;
        startX = e.pageX - translateX;
        startY = e.pageY - translateY;
        const mediaElement = modalImage.style.display === 'block' ? modalImage : modalVideo;
        mediaElement.classList.add('dragging');
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        modalImage.classList.remove('dragging');
        modalVideo.classList.remove('dragging');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        translateX = e.pageX - startX;
        translateY = e.pageY - startY;
        updateZoom(scale); // Apply transform to the correct element
    });

    modal.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        updateZoom(scale + delta);
    });

    prevBtn.addEventListener('click', () => {
        showImage(currentIndex - 1);
    });

    nextBtn.addEventListener('click', () => {
        showImage(currentIndex + 1);
    });

    document.addEventListener('keydown', (e) => {
        if (modal.style.display !== 'none') {
            if (e.key === 'Escape') closeModal();
            if (e.key === 'ArrowLeft') showImage(currentIndex - 1);
            if (e.key === 'ArrowRight') showImage(currentIndex + 1);
        }
    });

    async function applySettings() {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        updateGridSize(settings.gallery_grid_size);
    }

    if (galleryGrid) {
        // Apply settings from server
        applySettings();
        loadImages();
    }

    // Memory cleanup when navigating away from the gallery page
    window.addEventListener('beforeunload', () => {
        allImages = [];
        if (galleryGrid) galleryGrid.innerHTML = '';
        if (imageObserver) imageObserver.disconnect();
        document.body.removeChild(dateIndicator);
    });
});