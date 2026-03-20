function togglePrivacy(trackId, btn) {
  const isPublic = btn.dataset.public === 'true';
  const newValue = !isPublic;

  // Обновляем кнопку
  btn.dataset.public = newValue ? 'true' : 'false';
  btn.textContent = newValue ? 'Сделать приватным' : 'Сделать публичным';
  btn.classList.toggle('privacy-public', newValue);
  btn.classList.toggle('privacy-private', !newValue);

  // Находим надпись под названием и меняем её
  const trackItem = btn.closest('.track-item');
  const metaLabel = trackItem.querySelector('.track-meta span');
  if (metaLabel) {
    metaLabel.textContent = newValue ? 'Публичный' : 'Приватный';
    metaLabel.classList.toggle('public-label', newValue);
    metaLabel.classList.toggle('private-label', !newValue);
  }

  // Здесь можно сделать fetch к серверу, чтобы сохранить состояние
  fetch(`/toggle_privacy/${trackId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_public: newValue })
  }).catch(console.error);
}


// player
(() => {
  const playButtons = document.querySelectorAll('.play-btn');
  const player = document.getElementById('player-audio');
  const floating = document.getElementById('floating-player');
  const playerTrack = document.getElementById('player-track');
  const playerArtist = document.getElementById('player-artist');
  const playerThumb = document.getElementById('player-thumb');
  const playerPlay = document.getElementById('player-play');
  const playerProgress = document.getElementById('player-progress');
  const playerCurrent = document.getElementById('player-current');
  const playerDuration = document.getElementById('player-duration');
  const playerVolume = document.getElementById('player-volume');
  const playerDownload = document.getElementById('player-download');
  const playerMute = document.getElementById('player-mute');
  const playerClose = document.getElementById('player-close');
  const playerOpen = document.getElementById('player-open');

  let currentBtn = null;
  let isHidden = false;

  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 9v6h4l5 5V4L9 9H5z" fill="currentColor"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.5 12l4-4m0 8l-4-4M5 9v6h4l5 5V4L9 9H5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v10M7 8l5 5 5-5M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function normalizePath(path) {
    try { return new URL(path, window.location.href).pathname; }
    catch(e){ return path; }
  }
  function fmtTime(sec){
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    sec = Math.floor(sec);
    const m = Math.floor(sec/60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2,'0')}`;
  }

  // init UI
  playerPlay.innerHTML = ICON.play;
  playerMute.innerHTML = ICON.volume;
  playerDownload.innerHTML = ICON.download + '<span style="margin-left:8px;font-weight:700;">Скачать</span>';

  function showPlayer(autoplay = false){
    floating.classList.add('active');
    floating.setAttribute('aria-hidden','false');
    isHidden = false;
    playerOpen.style.display = 'none';
    if (autoplay && player.src) player.play().catch(()=>{});
  }

  function hidePlayer(){
    // ставим на паузу и скрываем
    try { player.pause(); } catch(e){}
    floating.classList.remove('active');
    floating.setAttribute('aria-hidden','true');
    isHidden = true;
    playerOpen.style.display = 'flex';
  }

  // play buttons in track list
  playButtons.forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const src = btn.dataset.file;
      if (!src) return;

      // если плеер скрыт — показать
      if (isHidden) showPlayer();

      const normSrc = normalizePath(src);
      const cur = player.getAttribute('src') || '';
      const normCur = cur ? normalizePath(cur) : '';

      if (normCur && normCur === normSrc) {
        if (player.paused) { try { await player.play(); } catch(e){} }
        else player.pause();
        return;
      }

      if (currentBtn && currentBtn !== btn) currentBtn.textContent = '▶';
      currentBtn = btn;

      player.src = src;
      const title = btn.closest('.track-details').querySelector('.track-title').textContent.trim();
      playerTrack.textContent = title;
      playerArtist.textContent = '';
      playerThumb.textContent = title.slice(0,2).toUpperCase();
      playerDownload.setAttribute('href', src);

      try { await player.play(); } catch(e){ console.warn(e); }

      showPlayer();
    });
  });

  // open button handler
  playerOpen.addEventListener('click', () => {
    showPlayer();
  });

  // close button handler
  playerClose.addEventListener('click', () => {
    hidePlayer();
  });

  // bottom play/pause
  playerPlay.addEventListener('click', async () => {
    if (!player.src) return;
    if (player.paused) { try { await player.play(); } catch(e){} }
    else player.pause();
  });

  // mute toggle
  playerMute.addEventListener('click', () => {
    if (player.muted) { player.muted = false; playerMute.innerHTML = ICON.volume; playerVolume.value = player.volume; }
    else { player.muted = true; playerMute.innerHTML = ICON.mute; playerVolume.value = 0; }
  });

  // volume slider
  playerVolume.addEventListener('input', () => {
    player.volume = parseFloat(playerVolume.value);
    if (player.volume === 0) { player.muted = true; playerMute.innerHTML = ICON.mute; }
    else { player.muted = false; playerMute.innerHTML = ICON.volume; }
  });

  // time/progress
  player.addEventListener('loadedmetadata', () => {
    playerDuration.textContent = fmtTime(player.duration);
    playerCurrent.textContent = fmtTime(player.currentTime);
  });
  player.addEventListener('timeupdate', () => {
    playerCurrent.textContent = fmtTime(player.currentTime);
    if (player.duration && isFinite(player.duration)) {
      const val = (player.currentTime / player.duration) * 100;
      playerProgress.value = val || 0;
    }
  });
  playerProgress.addEventListener('input', () => {
    if (!player.duration || !isFinite(player.duration)) return;
    player.currentTime = (playerProgress.value/100) * player.duration;
  });

  // sync icons
  player.addEventListener('play', () => {
    playerPlay.innerHTML = ICON.pause;
    if (currentBtn) currentBtn.textContent = '⏸';
  });
  player.addEventListener('pause', () => {
    playerPlay.innerHTML = ICON.play;
    if (currentBtn) currentBtn.textContent = '▶';
  });
  player.addEventListener('ended', () => {
    playerPlay.innerHTML = ICON.play;
    if (currentBtn) currentBtn.textContent = '▶';
  });

  // initial
  document.addEventListener('DOMContentLoaded', () => {
    playerVolume.value = typeof player.volume !== 'undefined' ? player.volume : 1;
    playerProgress.value = 0;
    // если хотим — можно скрыть плеер по умолчанию; сейчас он скрыт (не active)
    playerOpen.style.display = 'none';
  });

})();