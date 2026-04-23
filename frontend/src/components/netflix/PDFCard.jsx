import React, { useState } from 'react';
import { Star, BookOpen, Play, MoreVertical, Trash2, Copy } from 'lucide-react';

export default function PDFCard({ file, progress, thumbnail, isFav, onOpen, onToggleFav, onDelete, onCopy }) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const title = (file.name || 'Untitled').replace(/\.pdf$/i, '');
  const progressPct = progress?.percent || 0;
  const addedDate = file.createdAt
    ? new Date(file.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  // Derive a color from the file name for placeholder bg
  const colors = [
    ['#1e3a5f', '#3b82f6'], ['#1a1a4e', '#6366f1'], ['#2d1b4e', '#a78bfa'],
    ['#1a3a2a', '#34d399'], ['#3a1a1a', '#f87171'], ['#2a2a1a', '#fbbf24'],
  ];
  const colorIdx = (file.id || '').charCodeAt(0) % colors.length;
  const [bgColor, accentColor] = colors[colorIdx];

  return (
    <div
      className="relative group cursor-pointer select-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      onClick={() => !menuOpen && onOpen(file)}
      style={{ transition: 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
    >
      {/* Card */}
      <div
        className="rounded-xl overflow-hidden border border-white/5"
        style={{
          background: '#1a1a1a',
          transform: hovered ? 'scale(1.04) translateY(-3px)' : 'scale(1)',
          transition: 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.25s ease',
          boxShadow: hovered
            ? '0 20px 50px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 4px 15px rgba(0,0,0,0.4)',
        }}
      >
        {/* Thumbnail area */}
        <div
          className="relative overflow-hidden"
          style={{ paddingBottom: '130%', background: bgColor }}
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover object-top"
              style={{ transition: 'transform 0.3s ease', transform: hovered ? 'scale(1.05)' : 'scale(1)' }}
              loading="lazy"
            />
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-4"
              style={{ background: `linear-gradient(135deg, ${bgColor}, ${bgColor}cc)` }}
            >
              <div
                className="w-12 h-14 rounded-lg flex items-center justify-center mb-3 text-xl font-black"
                style={{ background: accentColor + '30', border: `2px solid ${accentColor}40`, color: accentColor }}
              >
                {title.charAt(0).toUpperCase()}
              </div>
              <p className="text-xs font-medium text-center leading-tight text-white/60 line-clamp-3">{title}</p>
            </div>
          )}

          {/* PDF badge */}
          <div className="absolute top-2 left-2">
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/60 text-gray-400 border border-white/10">
              PDF
            </span>
          </div>

          {/* Favorite button */}
          <button
            className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200 ${
              isFav
                ? 'bg-yellow-500/20 text-yellow-400 opacity-100'
                : 'bg-black/50 text-gray-500 opacity-0 group-hover:opacity-100'
            } hover:scale-110 active:scale-90 backdrop-blur-sm`}
            onClick={e => { e.stopPropagation(); onToggleFav(file.id); }}
          >
            <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
          </button>

          {/* Context menu button */}
          <button
            className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 text-gray-400 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm hover:text-white"
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
          >
            <MoreVertical size={12} />
          </button>

          {/* Hover overlay */}
          {hovered && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-center pb-4">
              <div className="flex gap-2">
                <button
                  onClick={e => { e.stopPropagation(); onOpen(file); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  {progressPct > 0 ? <Play size={11} fill="white" /> : <BookOpen size={11} />}
                  {progressPct > 0 ? 'Resume' : 'Open'}
                </button>
              </div>
            </div>
          )}

          {/* Dropdown menu */}
          {menuOpen && (
            <div
              className="absolute bottom-10 right-2 bg-[#252525] border border-white/10 rounded-xl shadow-2xl py-1 w-40 z-20"
              onClick={e => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => { setMenuOpen(false); onOpen(file); }}
              >
                <BookOpen size={12} /> Open
              </button>
              {onCopy && (
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                  onClick={() => { setMenuOpen(false); onCopy(file.id); }}
                >
                  <Copy size={12} /> Duplicate
                </button>
              )}
              {onDelete && (
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => { setMenuOpen(false); onDelete(file.id); }}
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>

        {/* Card footer */}
        <div className="px-3 py-2.5">
          <p className="text-xs font-semibold text-white/90 truncate leading-tight mb-1">{title}</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600">{addedDate}</span>
            {progressPct > 0 && (
              <span className="text-[10px] text-blue-400 font-medium">{progressPct}%</span>
            )}
          </div>
          {progressPct > 0 && (
            <div className="mt-1.5 h-0.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct > 80 ? '#34d399' : progressPct > 40 ? '#3b82f6' : '#6366f1',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
