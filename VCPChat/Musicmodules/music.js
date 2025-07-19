// Musicmodules/music.js - Updated for Modern UI & Web Audio API Visualization

document.addEventListener('DOMContentLoaded', () => {
    // DOM Element selections
    const audio = new Audio();
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const volumeBtn = document.getElementById('volume-btn');
    const modeBtn = document.getElementById('mode-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const progressBar = document.querySelector('.progress-bar');
    const progress = document.querySelector('.progress');
    const currentTimeEl = document.querySelector('.current-time');
    const durationEl = document.querySelector('.duration');
    const albumArt = document.querySelector('.album-art');
    const trackTitle = document.querySelector('.track-title');
    const trackArtist = document.querySelector('.track-artist');
    const playlistEl = document.getElementById('playlist');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const searchInput = document.getElementById('search-input');
    const loadingIndicator = document.getElementById('loading-indicator');
    const scanProgressContainer = document.querySelector('.scan-progress-container');
    const scanProgressBar = document.querySelector('.scan-progress-bar');
    const scanProgressLabel = document.querySelector('.scan-progress-label');
    const playerBackground = document.getElementById('player-background');
    const visualizerCanvas = document.getElementById('visualizer'); // 新增
    const visualizerCtx = visualizerCanvas.getContext('2d'); // 新增

    // State variables
    let playlist = [];
    let currentTrackIndex = 0;
    let isPlaying = false;
    let totalFilesToScan = 0;
    let filesScanned = 0;
    const playModes = ['repeat', 'repeat-one', 'shuffle'];
    let currentPlayMode = 0; // 0: repeat, 1: repeat-one, 2: shuffle
    let currentTheme = 'dark'; // Default theme
    let visualizerColor = { r: 118, g: 106, b: 226 }; // Default --music-highlight color

    // Web Audio API variables
    let audioContext;
    let analyser;
    let sourceNode;
    let dataArray;
    let animationFrameId;

    // --- Web Audio API Initialization ---
    const setupAudioContext = () => {
        if (audioContext) return; // 防止重复初始化
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256; // 可调整以获得不同细节的可视化

            // 使用现有的 <audio> 元素作为源
            sourceNode = audioContext.createMediaElementSource(audio);

            // 连接节点: source -> analyser -> destination
            sourceNode.connect(analyser);
            analyser.connect(audioContext.destination);

            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        } catch (e) {
            console.error("Web Audio API is not supported in this browser.", e);
        }
    };


    // --- Helper Functions ---

    const hexToRgb = (hex) => {
        if (!hex) return null;
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    };
    
    const updateBlurredBackground = (imageUrl) => {
        if (playerBackground) {
            playerBackground.style.backgroundImage = imageUrl;
        }
    };


    // --- Core Player Logic ---

    const loadTrack = (trackIndex, andPlay = true) => {
        if (playlist.length === 0) {
            // If playlist is empty, clear info and notify main process
            trackTitle.textContent = '未选择歌曲';
            trackArtist.textContent = '未知艺术家';
            const defaultArtUrl = `url('../assets/${currentTheme === 'light' ? 'musiclight.jpeg' : 'musicdark.jpeg'}')`;
            albumArt.style.backgroundImage = defaultArtUrl;
            updateBlurredBackground(defaultArtUrl);
            audio.src = '';
            if (window.electron) {
                window.electron.send('music-track-changed', null);
            }
            renderPlaylist();
            return;
        }
        currentTrackIndex = trackIndex;
        const track = playlist[trackIndex];

        // Send track info to the main process
        if (window.electron) {
            window.electron.send('music-track-changed', {
                title: track.title,
                artist: track.artist,
                album: track.album
            });
        }

        trackTitle.textContent = track.title || '未知标题';
        trackArtist.textContent = track.artist || '未知艺术家';
        
        const defaultArtUrl = `url('../assets/${currentTheme === 'light' ? 'musiclight.jpeg' : 'musicdark.jpeg'}')`;
        const albumArtUrl = track.albumArt ? `url('file://${track.albumArt.replace(/\\/g, '/')}')` : defaultArtUrl;
        
        albumArt.style.backgroundImage = albumArtUrl;
        updateBlurredBackground(albumArtUrl);

        audio.src = track.path;
        renderPlaylist(); // Re-render to update active track highlight
        if (andPlay) {
            playTrack();
        }
    };

    const playTrack = () => {
        if (playlist.length === 0) return;
        
        // 确保 AudioContext 已初始化并处于 'running' 状态
        if (!audioContext) {
            setupAudioContext();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        isPlaying = true;
        playPauseBtn.classList.add('is-playing');
        audio.play().catch(error => console.error("Playback error:", error));
        
        // 启动可视化
        drawVisualizer();
    };

    const pauseTrack = () => {
        isPlaying = false;
        playPauseBtn.classList.remove('is-playing');
        audio.pause();
        
        // 停止可视化
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
    };

    const prevTrack = () => {
        currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
        loadTrack(currentTrackIndex);
    };

    const nextTrack = () => {
        if (playlist.length <= 1) {
            loadTrack(currentTrackIndex);
            return;
        }

        switch (playModes[currentPlayMode]) {
            case 'repeat':
                currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
                break;
            case 'repeat-one':
                // 'ended' event will handle this by replaying the same track
                break;
            case 'shuffle':
                let nextIndex;
                do {
                    nextIndex = Math.floor(Math.random() * playlist.length);
                } while (playlist.length > 1 && nextIndex === currentTrackIndex);
                currentTrackIndex = nextIndex;
                break;
        }
        loadTrack(currentTrackIndex);
    };

    // --- UI Update Functions ---

    const updateProgress = () => {
        if (audio.duration && isFinite(audio.duration)) {
            const progressPercent = (audio.currentTime / audio.duration) * 100;
            progress.style.width = `${progressPercent}%`;
            currentTimeEl.textContent = formatTime(audio.currentTime);
            durationEl.textContent = formatTime(audio.duration);
        } else {
            progress.style.width = '0%';
            currentTimeEl.textContent = '0:00';
            durationEl.textContent = '0:00';
        }
    };

    const setProgress = (e) => {
        const width = progressBar.clientWidth;
        const clickX = e.offsetX;
        if (audio.duration && isFinite(audio.duration)) {
            audio.currentTime = (clickX / width) * audio.duration;
        }
    };
    
    const updateVolume = () => {
        audio.volume = volumeSlider.value;
        if (audio.volume === 0) {
            volumeBtn.classList.add('is-muted');
        } else {
            volumeBtn.classList.remove('is-muted');
        }
    };

    const toggleMute = () => {
        const isMuted = audio.volume === 0;
        if (isMuted) {
            volumeSlider.value = volumeSlider.value > 0 ? volumeSlider.value : 1;
        } else {
            volumeSlider.value = 0;
        }
        updateVolume();
    };

    const togglePlayMode = () => {
        currentPlayMode = (currentPlayMode + 1) % playModes.length;
        updateModeButton();
    };

    const updateModeButton = () => {
        modeBtn.className = 'control-btn icon-btn'; // Reset classes
        const currentMode = playModes[currentPlayMode];
        modeBtn.classList.add(currentMode);
        if (currentMode !== 'repeat') {
            modeBtn.classList.add('active');
        }
    };

    const renderPlaylist = (filteredPlaylist) => {
        const songsToRender = filteredPlaylist || playlist;
        playlistEl.innerHTML = '';
        const fragment = document.createDocumentFragment();
        songsToRender.forEach((track) => {
            const li = document.createElement('li');
            li.textContent = track.title || '未知标题';
            const originalIndex = playlist.indexOf(track);
            li.dataset.index = originalIndex;
            if (originalIndex === currentTrackIndex) {
                li.classList.add('active');
            }
            fragment.appendChild(li);
        });
        playlistEl.appendChild(fragment);
    };

    // --- Visualizer Drawing Function ---
    const drawVisualizer = () => {
        if (!isPlaying || !analyser) {
            visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
            return;
        }

        animationFrameId = requestAnimationFrame(drawVisualizer);

        analyser.getByteFrequencyData(dataArray);

        visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

        const bufferLength = analyser.frequencyBinCount;
        const barWidth = (visualizerCanvas.width / bufferLength) * 1.5;
        let x = 0;

        const gradient = visualizerCtx.createLinearGradient(0, 0, 0, visualizerCanvas.height);
        const { r, g, b } = visualizerColor;
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.5)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.1)`);
        visualizerCtx.fillStyle = gradient;

        visualizerCtx.beginPath();
        visualizerCtx.moveTo(0, visualizerCanvas.height);

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * visualizerCanvas.height * 0.8;
            
            // 绘制平滑曲线
            const y = visualizerCanvas.height - barHeight;
            const cp1x = x + barWidth / 2;
            const cp1y = y;
            const next_x = x + barWidth;
            
            visualizerCtx.lineTo(x, y);
            
            x += barWidth + 1; // +1 for spacing
        }

        visualizerCtx.lineTo(visualizerCanvas.width, visualizerCanvas.height);
        visualizerCtx.closePath();
        visualizerCtx.fill();
    };


    // --- Event Listeners ---

    playPauseBtn.addEventListener('click', () => {
        // 第一次用户交互时初始化 AudioContext
        if (!audioContext) {
            setupAudioContext();
        }
        isPlaying ? pauseTrack() : playTrack();
    });
    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', nextTrack);
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateProgress);
    progressBar.addEventListener('click', setProgress);
    audio.addEventListener('ended', () => {
        if (playModes[currentPlayMode] === 'repeat-one') {
            audio.currentTime = 0;
            playTrack();
        } else {
            nextTrack();
        }
    });

    volumeSlider.addEventListener('input', updateVolume);
    volumeBtn.addEventListener('click', toggleMute);
    modeBtn.addEventListener('click', togglePlayMode);

    playlistEl.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const index = parseInt(e.target.dataset.index, 10);
            if (index !== currentTrackIndex || !isPlaying) {
                loadTrack(index);
            }
        }
    });

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredPlaylist = playlist.filter(track =>
            (track.title || '').toLowerCase().includes(searchTerm) ||
            (track.artist || '').toLowerCase().includes(searchTerm)
        );
        renderPlaylist(filteredPlaylist);
    });
    
    window.addEventListener('resize', () => {
        visualizerCanvas.width = visualizerCanvas.clientWidth;
        visualizerCanvas.height = visualizerCanvas.clientHeight;
    });


    // --- Electron IPC and Initialization ---

    const setupElectronHandlers = () => {
        if (!window.electron) return;

        addFolderBtn.addEventListener('click', () => {
            playlist = [];
            if (window.electron) {
                window.electron.send('music-track-changed', null);
            }
            renderPlaylist();
            loadingIndicator.style.display = 'flex';
            scanProgressContainer.style.display = 'none';
            scanProgressBar.style.width = '0%';
            scanProgressLabel.textContent = '';
            window.electron.send('open-music-folder');
        });

        window.electron.on('scan-started', ({ total }) => {
            totalFilesToScan = total;
            filesScanned = 0;
            scanProgressContainer.style.display = 'block';
            scanProgressLabel.textContent = `0 / ${totalFilesToScan}`;
        });

        window.electron.on('scan-progress', () => {
            filesScanned++;
            const percentage = totalFilesToScan > 0 ? (filesScanned / totalFilesToScan) * 100 : 0;
            scanProgressBar.style.width = `${percentage}%`;
            scanProgressLabel.textContent = `${filesScanned} / ${totalFilesToScan}`;
        });

        window.electron.on('scan-finished', (newlyScannedFiles) => {
            loadingIndicator.style.display = 'none';
            playlist = newlyScannedFiles;
            renderPlaylist();
            window.electron.send('save-music-playlist', playlist);
            if (playlist.length > 0 && !audio.src) {
                loadTrack(0, false); // Load first track but don't play
            }
        });

        // Listen for commands from the main process (sent via the plugin)
        window.electronAPI.onMusicCommand(({ command, target }) => {
            console.log(`[Music Player] Received command: ${command}, Target: ${target}`);
            switch (command) {
                case 'play':
                    if (target) {
                        const targetLower = target.toLowerCase();
                        const trackIndex = playlist.findIndex(track =>
                            (track.title || '').toLowerCase().includes(targetLower) ||
                            (track.artist || '').toLowerCase().includes(targetLower)
                        );

                        if (trackIndex > -1) {
                            loadTrack(trackIndex, true);
                        } else {
                            console.warn(`[Music Player] Track containing "${target}" not found.`);
                            // Optionally, send a notification back to the user? For now, just log.
                        }
                    } else {
                        playTrack();
                    }
                    break;
                case 'pause':
                    pauseTrack();
                    break;
                case 'next':
                    nextTrack();
                    break;
                case 'prev':
                    prevTrack();
                    break;
                default:
                    console.warn(`[Music Player] Unknown command received: ${command}`);
            }
        });
    };
    
    // --- Theme Handling ---
    const applyTheme = (theme) => {
        currentTheme = theme;
        document.body.classList.toggle('light-theme', theme === 'light');
        
        // Update visualizer color from CSS variable
        // We need a small delay to ensure the new CSS variables are applied before reading them
        setTimeout(() => {
            const highlightColor = getComputedStyle(document.body).getPropertyValue('--music-highlight');
            const rgbColor = hexToRgb(highlightColor);
            if (rgbColor) {
                visualizerColor = rgbColor;
            }
        }, 50);

        const currentArt = albumArt.style.backgroundImage;
        if (!currentArt || currentArt.includes('musicdark.jpeg') || currentArt.includes('musiclight.jpeg')) {
            const defaultArtUrl = `url('../assets/${theme === 'light' ? 'musiclight.jpeg' : 'musicdark.jpeg'}')`;
            albumArt.style.backgroundImage = defaultArtUrl;
            updateBlurredBackground(defaultArtUrl);
        }
        // Redraw visualizer with new theme colors if needed
        if (isPlaying) {
            drawVisualizer();
        }
    };
    
    const initializeTheme = async () => {
        if (!window.electronAPI) {
            console.warn('electronAPI not found. Defaulting to dark theme.');
            applyTheme('dark');
            return;
        }
        try {
            const theme = await window.electronAPI.getCurrentTheme();
            applyTheme(theme || 'dark');
            window.electronAPI.onThemeUpdated((newTheme) => {
                console.log(`Theme update received in music player: ${newTheme}`);
                applyTheme(newTheme);
            });
        } catch (error) {
            console.error('Failed to initialize theme:', error);
            applyTheme('dark'); // Fallback
        }
    };
    
    // --- App Initialization ---
    const init = async () => {
        // Set canvas size
        visualizerCanvas.width = visualizerCanvas.clientWidth;
        visualizerCanvas.height = visualizerCanvas.clientHeight;

        setupElectronHandlers();
        updateModeButton();
        await initializeTheme();
    
        if (window.electron) {
            const savedPlaylist = await window.electron.invoke('get-music-playlist');
            if (savedPlaylist && savedPlaylist.length > 0) {
                playlist = savedPlaylist;
                renderPlaylist();
                loadTrack(0, false); // Use loadTrack to correctly initialize and send IPC
            }
        }
        
        // Signal to the main process that the renderer is ready to receive commands.
        if (window.electron) {
            window.electron.send('music-renderer-ready');
            console.log('[Music Player] Renderer is ready. Signal sent to main process.');
        }
    };

    init();
});
