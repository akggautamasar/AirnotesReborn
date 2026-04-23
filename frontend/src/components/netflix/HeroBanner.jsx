import React, { useEffect, useRef, useState } from 'react';
import { Play, BookOpen, Star, Info } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { progressStore } from '../../utils/storage';

export default function HeroBanner({ onOpen, thumbnails, favorites, onToggleFav }) {
  const { state } = useApp();
  const [heroFile, setHeroFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    async function pickHero() {
      // prefer last opened
      let candidate = null;
      if (state.recentFiles.length > 0) {
        const lastId = state.recentFiles[0]?.fileId;
        candidate = state.files.find(f => f.id === lastId);
      }
      // fallback to newest file
      if (!candidate && state.files.length > 0) {
        candidate = [...state.files].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
      }
      if (candidate) {
        setHeroFile(candidate);
        const prog = await progressStore.get(candidate.id);
        setProgress(prog);
        setIsFav(!!(favorites && favorites[candidate.id]));
      }
    }
    pickHero();
  }, [state.files, state.recentFiles, favorites]);

  if (!heroFile) {
    return (
      <div className="relative h-[55vh] min-h-[360px] flex items-end pb-16 px-10 bg-gradient-to-b from-[#111] to-[#0a0a0a]">
        <div className="max-w-2xl">
          <div className="h-8 w-48 rounded-lg bg-white/5 shimmer mb-3" />
          <div className="h-4 w-80 rounded bg-white/5 shimmer mb-6" />
          <div className="flex gap-3">
            <div className="h-11 w-36 rounded-lg bg-white/5 shimmer" />
            <div className="h-11 w-36 rounded-lg bg-white/5 shimmer" />
          </div>
        </div>
      </div>
    );
  }

  const thumb = thumbnails && thumbnails[heroFile.id];
  const progressPct = progress?.percent || 0;
  const truncName = heroFile.name?.replace(/\.pdf$/i, '') || 'Untitled';

  return (
    <div className="relative h-[58vh] min-h-[380px] overflow-hidden">
      {/* Background */}
      {thumb ? (
        <div
          className="absolute inset-0 scale-110"
          style={{
            backgroundImage: `url(${thumb})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            filter: 'blur(18px) brightness(0.35)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/60 via-[#0f0f0f] to-purple-950/40" />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />

      {/* Floating PDF thumbnail (right side) */}
      {thumb && (
        <div className="absolute right-8 md:right-16 top-1/2 -translate-y-1/2 hidden lg:block">
          <div
            className="w-40 h-52 rounded-xl overflow-hidden shadow-2xl border border-white/10"
            style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)' }}
          >
            <img src={thumb} alt={truncName} className="w-full h-full object-cover object-top" />
          </div>
          {progressPct > 0 && (
            <div className="mt-2 bg-white/10 rounded-full h-1 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-end pb-14 px-8 md:px-14 max-w-2xl">
        {/* Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-blue-400 bg-blue-500/15 border border-blue-500/30 px-3 py-1 rounded-full">
            {state.recentFiles.length > 0 && state.recentFiles[0]?.fileId === heroFile.id ? '▶ Continue Reading' : '✦ Featured'}
          </span>
        </div>

        {/* Title */}
        <h1
          className="text-3xl md:text-5xl font-black text-white mb-3 leading-tight"
          style={{ textShadow: '0 4px 24px rgba(0,0,0,0.8)' }}
        >
          {truncName.length > 40 ? truncName.slice(0, 40) + '…' : truncName}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-3 mb-5 text-sm text-gray-400">
          <span className="text-green-400 font-semibold">PDF</span>
          {progressPct > 0 && (
            <>
              <span>•</span>
              <span>{progressPct}% complete</span>
            </>
          )}
          {heroFile.createdAt && (
            <>
              <span>•</span>
              <span>Added {new Date(heroFile.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </>
          )}
        </div>

        {/* Progress bar */}
        {progressPct > 0 && (
          <div className="w-64 h-1 bg-white/20 rounded-full mb-5 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onOpen(heroFile)}
            className="flex items-center gap-2.5 px-7 py-3 rounded-xl font-bold text-sm transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}
          >
            {progressPct > 0 ? <Play size={16} fill="white" /> : <BookOpen size={16} />}
            {progressPct > 0 ? 'Resume Reading' : 'Start Reading'}
          </button>

          <button
            onClick={() => { onToggleFav(heroFile.id); setIsFav(v => !v); }}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm border transition-all duration-200 hover:scale-105 active:scale-95 ${
              isFav
                ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/15'
            }`}
          >
            <Star size={15} fill={isFav ? 'currentColor' : 'none'} />
            {isFav ? 'Favorited' : 'Favorite'}
          </button>
        </div>
      </div>
    </div>
  );
}
