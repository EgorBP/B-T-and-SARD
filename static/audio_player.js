(() => {
  const player = document.getElementById("player-audio");
  const floating = document.getElementById("floating-player");
  const playerTrack = document.getElementById("player-track");
  const playerThumb = document.getElementById("player-thumb");
  const playerPlay = document.getElementById("player-play");
  const playerProgress = document.getElementById("player-progress");
  const playerCurrent = document.getElementById("player-current");
  const playerDuration = document.getElementById("player-duration");
  const playerVolume = document.getElementById("player-volume");
  const playerDownload = document.getElementById("player-download");
  const playerMute = document.getElementById("player-mute");
  const playerClose = document.getElementById("player-close");
  const playerOpen = document.getElementById("player-open");

  if (!player || !floating) return;

  let currentSrc = "";
  let isHidden = false;
  let buttonsBySrc = new Map();
  let lastSyncedSrc = "";

  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 9v6h4l5 5V4L9 9H5z" fill="currentColor"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.5 12l4-4m0 8l-4-4M5 9v6h4l5 5V4L9 9H5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v10M7 8l5 5 5-5M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function fmtTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return "0:00";
    sec = Math.floor(sec);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function showPlayer(autoplay = false) {
    floating.classList.add("active");
    floating.setAttribute("aria-hidden", "false");
    isHidden = false;
    if (playerOpen) playerOpen.style.display = "none";
    if (autoplay && player.src) player.play().catch(() => {});
  }

  function hidePlayer() {
    try {
      player.pause();
    } catch {}
    floating.classList.remove("active");
    floating.setAttribute("aria-hidden", "true");
    isHidden = true;
    if (playerOpen) playerOpen.style.display = "flex";
  }

  function setTrack({ src, title }) {
    if (!src) return;
    if (currentSrc === src) return;
    currentSrc = src;
    player.src = src;
    if (playerTrack) playerTrack.textContent = title || "Трек";
    if (playerThumb) playerThumb.textContent = (title || "X").slice(0, 2).toUpperCase();
    if (playerDownload) playerDownload.setAttribute("href", src);
  }

  function indexListButtons() {
    buttonsBySrc = new Map();
    const btns = document.querySelectorAll(".play-btn");
    for (const btn of btns) {
      const src = btn.getAttribute("data-file") || "";
      if (!src) continue;
      const arr = buttonsBySrc.get(src) || [];
      arr.push(btn);
      buttonsBySrc.set(src, arr);
    }
  }

  function setButtonsForSrc(src, { playing }) {
    const arr = buttonsBySrc.get(src);
    if (!arr) return;
    for (const btn of arr) {
      btn.innerHTML = playing ? ICON.pause : ICON.play;
      btn.setAttribute("aria-label", playing ? "Пауза" : "Воспроизвести");
      const item = btn.closest(".track-item");
      if (item) item.classList.toggle("is-current", !!src && src === currentSrc);
    }
  }

  function syncButtons() {
    if (lastSyncedSrc && lastSyncedSrc !== currentSrc) {
      setButtonsForSrc(lastSyncedSrc, { playing: false });
    }
    if (currentSrc) {
      setButtonsForSrc(currentSrc, { playing: !player.paused && !player.ended });
    }
    lastSyncedSrc = currentSrc;
  }

  if (playerPlay) playerPlay.innerHTML = ICON.play;
  if (playerMute) playerMute.innerHTML = ICON.volume;
  if (playerDownload) playerDownload.innerHTML = ICON.download + '<span style="margin-left:8px;font-weight:700;">Скачать</span>';
  if (playerOpen) playerOpen.style.display = "none";

  // Делегированный хендлер: работает на динамических списках SPA
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".play-btn");
    if (!btn) return;
    e.preventDefault();

    const src = btn.getAttribute("data-file");
    const title = btn.getAttribute("data-title") || "";
    if (!src) return;

    if (isHidden) showPlayer(false);

    // Toggle: clicking current track pauses/resumes.
    if (currentSrc === src && player.src) {
      if (player.paused || player.ended) {
        try {
          await player.play();
        } catch {}
      } else {
        player.pause();
      }
      showPlayer(false);
      syncButtons();
      return;
    }

    setTrack({ src, title });
    try {
      await player.play();
    } catch {}
    showPlayer(false);
    syncButtons();
  });

  if (playerOpen) playerOpen.addEventListener("click", () => showPlayer(false));
  if (playerClose) playerClose.addEventListener("click", hidePlayer);

  if (playerPlay) {
    playerPlay.addEventListener("click", async () => {
      if (!player.src) return;
      if (player.paused) {
        try {
          await player.play();
        } catch {}
      } else {
        player.pause();
      }
    });
  }

  if (playerMute && playerVolume) {
    playerMute.addEventListener("click", () => {
      if (player.muted) {
        player.muted = false;
        playerMute.innerHTML = ICON.volume;
        playerVolume.value = String(player.volume);
      } else {
        player.muted = true;
        playerMute.innerHTML = ICON.mute;
        playerVolume.value = "0";
      }
    });

    playerVolume.addEventListener("input", () => {
      player.volume = parseFloat(playerVolume.value);
      if (player.volume === 0) {
        player.muted = true;
        playerMute.innerHTML = ICON.mute;
      } else {
        player.muted = false;
        playerMute.innerHTML = ICON.volume;
      }
    });
  }

  if (playerProgress && playerCurrent && playerDuration) {
    player.addEventListener("loadedmetadata", () => {
      playerDuration.textContent = fmtTime(player.duration);
      playerCurrent.textContent = fmtTime(player.currentTime);
    });
    player.addEventListener("timeupdate", () => {
      playerCurrent.textContent = fmtTime(player.currentTime);
      if (player.duration && isFinite(player.duration)) {
        const val = (player.currentTime / player.duration) * 100;
        playerProgress.value = String(val || 0);
      }
    });
    playerProgress.addEventListener("input", () => {
      if (!player.duration || !isFinite(player.duration)) return;
      player.currentTime = (parseFloat(playerProgress.value) / 100) * player.duration;
    });
  }

  player.addEventListener("play", () => {
    if (playerPlay) playerPlay.innerHTML = ICON.pause;
    syncButtons();
  });
  player.addEventListener("pause", () => {
    if (playerPlay) playerPlay.innerHTML = ICON.play;
    syncButtons();
  });
  player.addEventListener("ended", () => {
    if (playerPlay) playerPlay.innerHTML = ICON.play;
    syncButtons();
  });

  // Update play/pause icons after SPA renders lists.
  window.addEventListener("spotx:render", () => {
    indexListButtons();
    // On each render set all buttons to "play" quickly, then restore current state.
    for (const arr of buttonsBySrc.values()) {
      for (const btn of arr) {
        btn.innerHTML = ICON.play;
        btn.setAttribute("aria-label", "Воспроизвести");
        const item = btn.closest(".track-item");
        if (item) item.classList.remove("is-current");
      }
    }
    syncButtons();
  });

  // Initial state (for first load without SPA navigation).
  indexListButtons();
  for (const arr of buttonsBySrc.values()) {
    for (const btn of arr) {
      btn.innerHTML = ICON.play;
      btn.setAttribute("aria-label", "Воспроизвести");
    }
  }
  syncButtons();
})();
