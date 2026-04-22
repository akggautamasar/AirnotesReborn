import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  X, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, ChevronLeft, Download
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../utils/api';
import { cleanFileName, formatSize } from '../../utils/format';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoPlayer() {
  const { state, actions } = useApp();
  const file = state.openFile;
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideControlsTimer = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buffered, setBuffered] = useState(0);

  const streamUrl = file ? api.getVideoStreamUrl(file.id) : null;
  const title = file ? cleanFileName(file.name) : '';

  // ── Auto-hide controls ───────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    if (playing) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    return () => clearTimeout(hideControlsTimer.current);
  }, []);

  // ── Video event handlers ─────────────────────────────────────────────────
  function onLoadedMetadata() {
    setDuration(videoRef.current?.duration || 0);
    setLoading(false);
  }

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    // Update buffered
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
  }

  function onPlay() { setPlaying(true); }
  function onPause() { setPlaying(false); }
  function onEnded() { setPlaying(false); setShowControls(true); }
  function onError() { setError('Failed to load video. Please try again.'); setLoading(false); }
  function onWaiting() { setLoading(true); }
  function onCanPlay() { setLoading(false); }

  // ── Controls ─────────────────────────────────────────────────────────────
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.pause(); else v.play();
    resetHideTimer();
  }

  function seek(e) {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * duration;
    resetHideTimer();
  }

  function skip(seconds) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, v.currentTime + seconds));
  }

  function changeVolume(e) {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) videoRef.current.volume = val;
    setMuted(val === 0);
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    const newMuted = !muted;
    v.muted = newMuted;
    setMuted(newMuted);
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

  useEffect(() => {
    function onFsChange() {
      setFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); skip(-10); break;
        case 'ArrowRight': e.preventDefault(); skip(10); break;
        case 'ArrowUp': e.preventDefault(); changeVolume({ target: { value: Math.min(1, volume + 0.1) } }); break;
        case 'ArrowDown': e.preventDefault(); changeVolume({ target: { value: Math.max(0, volume - 0.1) } }); break;
        case 'm': toggleMute(); break;
        case 'f': toggleFullscreen(); break;
        case 'Escape': if (!document.fullscreenElement) actions.closeFile(); break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, volume, muted]);

  if (!file) return null;

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* ── Top bar ── */}
      <div className={`absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-3
                       bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300
                       ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={actions.closeFile}
          className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">{title}</p>
          <p className="text-white/50 text-xs">{formatSize(file.size)}</p>
        </div>
        <a
          href={streamUrl}
          download={file.name}
          className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
          title="Download"
        >
          <Download size={16} />
        </a>
        <button
          onClick={actions.closeFile}
          className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Video ── */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center cursor-pointer relative"
        onClick={togglePlay}
        onMouseMove={resetHideTimer}
      >
        {error ? (
          <div className="text-center">
            <p className="text-red-400 mb-2">{error}</p>
            <button onClick={() => { setError(null); setLoading(true); videoRef.current?.load(); }}
              className="text-white/60 text-sm underline">
              Retry
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={streamUrl}
            className="max-w-full max-h-full"
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onEnded}
            onError={onError}
            onWaiting={onWaiting}
            onCanPlay={onCanPlay}
            playsInline
          />
        )}

        {/* Loading spinner */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Big play/pause indicator */}
        {!loading && !error && (
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200 ${showControls && !playing ? 'opacity-100' : 'opacity-0'}`}>
            <div className="w-16 h-16 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Play size={28} className="text-white ml-1" fill="white" />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div className={`absolute bottom-0 left-0 right-0 z-10 px-4 pb-4 pt-12
                       bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300
                       ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
           onMouseMove={resetHideTimer}>

        {/* Progress bar */}
        <div
          className="w-full h-1 bg-white/20 rounded-full mb-3 cursor-pointer relative group"
          onClick={seek}
        >
          {/* Buffered */}
          <div className="absolute top-0 left-0 h-full bg-white/30 rounded-full transition-all"
               style={{ width: `${bufferedPct}%` }} />
          {/* Played */}
          <div className="absolute top-0 left-0 h-full bg-white rounded-full transition-all"
               style={{ width: `${progressPct}%` }} />
          {/* Thumb */}
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full
                         opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
               style={{ left: `calc(${progressPct}% - 6px)` }} />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
            {playing
              ? <Pause size={22} fill="white" />
              : <Play size={22} fill="white" className="ml-0.5" />}
          </button>

          {/* Skip */}
          <button onClick={() => skip(-10)} className="text-white/70 hover:text-white transition-colors" title="Back 10s">
            <SkipBack size={18} />
          </button>
          <button onClick={() => skip(10)} className="text-white/70 hover:text-white transition-colors" title="Forward 10s">
            <SkipForward size={18} />
          </button>

          {/* Time */}
          <span className="text-white/70 text-xs font-mono tabular-nums whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors">
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={changeVolume}
              className="w-20 accent-white cursor-pointer hidden sm:block"
            />
          </div>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
