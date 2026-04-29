(() => {
  const player = document.getElementById("player-audio");
  const floating = document.getElementById("floating-player");
  const playerTrack = document.getElementById("player-track");
  const playerThumb = document.getElementById("player-thumb");
  const playerCoverImg = document.getElementById("player-cover-img");
  const playerCoverFallback = document.getElementById("player-cover-fallback");
  const playerPlay = document.getElementById("player-play");
  const playerProgress = document.getElementById("player-progress");
  const playerCurrent = document.getElementById("player-current");
  const playerDuration = document.getElementById("player-duration");
  const playerVolume = document.getElementById("player-volume");
  const playerMute = document.getElementById("player-mute");
  const playerClose = document.getElementById("player-close");
  const playerOpen = document.getElementById("player-open");

  if (!player || !floating) return;

  let currentSrc = "";
  let isHidden = false;
  let buttonsBySrc = new Map();
  let lastSyncedSrc = "";

  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor"/><path d="M23 9l-6 6M17 9l6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
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
    try { player.pause(); } catch {}
    floating.classList.remove("active");
    floating.setAttribute("aria-hidden", "true");
    isHidden = true;
    if (playerOpen) playerOpen.style.display = "flex";
  }

  function setCover(coverUrl, title) {
    const fallbackText = (title || "X").slice(0, 2).toUpperCase();
    if (coverUrl) {
      if (playerCoverImg) {
        playerCoverImg.src = coverUrl;
        playerCoverImg.alt = title || "Обложка";
        playerCoverImg.style.display = "block";
      }
      if (playerCoverFallback) playerCoverFallback.style.display = "none";
      if (playerThumb) playerThumb.classList.add("has-cover");
    } else {
      if (playerCoverImg) { playerCoverImg.src = ""; playerCoverImg.style.display = "none"; }
      if (playerCoverFallback) { playerCoverFallback.textContent = fallbackText; playerCoverFallback.style.display = "flex"; }
      if (playerThumb) playerThumb.classList.remove("has-cover");
    }
  }

  function setTrack({ src, title, trackId, cover }) {
    if (!src) return;
    if (currentSrc === src) return;
    currentSrc = src;
    player.src = src;
    if (playerTrack) playerTrack.textContent = title || "Трек";
    setCover(cover, title);
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

  /* Progress bar gradient fill */
  function updateProgressFill() {
    if (!playerProgress) return;
    const val = parseFloat(playerProgress.value) || 0;
    playerProgress.style.setProperty("--progress", `${val}%`);
  }

  function updateVolumeFill() {
    if (!playerVolume) return;
    const val = (parseFloat(playerVolume.value) || 0) * 100;
    playerVolume.style.setProperty("--volume", `${val}%`);
  }

  // Init icons
  if (playerPlay) playerPlay.innerHTML = ICON.play;
  if (playerMute) playerMute.innerHTML = ICON.volume;
  if (playerOpen) playerOpen.style.display = "none";
  setCover("", "");

  // Delegated click handler for play buttons in SPA lists
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".play-btn");
    if (!btn) return;
    e.preventDefault();

    const src = btn.getAttribute("data-file");
    const title = btn.getAttribute("data-title") || "";
    const trackId = btn.getAttribute("data-track-id") || "";
    const cover = btn.getAttribute("data-cover") || "";
    if (!src) return;

    if (isHidden) showPlayer(false);

    if (currentSrc === src && player.src) {
      if (player.paused || player.ended) {
        try { await player.play(); } catch {}
      } else {
        player.pause();
      }
      showPlayer(false);
      syncButtons();
      return;
    }

    setTrack({ src, title, trackId, cover });
    try { await player.play(); } catch {}
    showPlayer(false);
    syncButtons();
  });

  if (playerOpen) playerOpen.addEventListener("click", () => showPlayer(false));
  if (playerClose) playerClose.addEventListener("click", hidePlayer);

  if (playerPlay) {
    playerPlay.addEventListener("click", async () => {
      if (!player.src) return;
      if (player.paused) {
        try { await player.play(); } catch {}
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
      updateVolumeFill();
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
      updateVolumeFill();
    });
    updateVolumeFill();
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
        updateProgressFill();
      }
    });
    playerProgress.addEventListener("input", () => {
      if (!player.duration || !isFinite(player.duration)) return;
      player.currentTime = (parseFloat(playerProgress.value) / 100) * player.duration;
      updateProgressFill();
    });
    updateProgressFill();
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

  window.addEventListener("spotx:render", () => {
    indexListButtons();
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

  indexListButtons();
  for (const arr of buttonsBySrc.values()) {
    for (const btn of arr) {
      btn.innerHTML = ICON.play;
      btn.setAttribute("aria-label", "Воспроизвести");
    }
  }
  syncButtons();
})();
