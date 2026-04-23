import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PDFCard from './PDFCard';

export default function ContentRow({ title, files, progresses, thumbnails, favorites, onOpen, onToggleFav, onDelete, onCopy, emptyMessage }) {
  const rowRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  useEffect(() => {
    checkScroll();
    const el = rowRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [files]);

  function checkScroll() {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }

  function scroll(dir) {
    const el = rowRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  // Mouse drag scroll
  function onMouseDown(e) {
    if (e.button !== 0) return;
    setIsDragging(false);
    dragStartX.current = e.pageX - rowRef.current.offsetLeft;
    dragScrollLeft.current = rowRef.current.scrollLeft;
    rowRef.current.style.cursor = 'grabbing';
    rowRef.current.style.userSelect = 'none';

    function onMove(e2) {
      const dx = e2.pageX - rowRef.current.offsetLeft - dragStartX.current;
      if (Math.abs(dx) > 6) setIsDragging(true);
      rowRef.current.scrollLeft = dragScrollLeft.current - dx;
    }
    function onUp() {
      rowRef.current.style.cursor = '';
      rowRef.current.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setTimeout(() => setIsDragging(false), 50);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  if (!files || files.length === 0) {
    if (!emptyMessage) return null;
    return (
      <section className="mb-8 px-8 md:px-14">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-3">
          {title}
        </h2>
        <p className="text-sm text-gray-600 italic">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="mb-8 group/row">
      {/* Row header */}
      <div className="flex items-center justify-between mb-4 px-8 md:px-14">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          {title}
          <span className="text-sm font-normal text-gray-600">({files.length})</span>
        </h2>
        <button className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors opacity-0 group-hover/row:opacity-100">
          See all →
        </button>
      </div>

      {/* Scroll container */}
      <div className="relative">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 w-14 flex items-center justify-start pl-1 bg-gradient-to-r from-[#0a0a0a] to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all hover:scale-110">
              <ChevronLeft size={16} className="text-white" />
            </div>
          </button>
        )}

        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 w-14 flex items-center justify-end pr-1 bg-gradient-to-l from-[#0a0a0a] to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all hover:scale-110">
              <ChevronRight size={16} className="text-white" />
            </div>
          </button>
        )}

        {/* Cards scroll area */}
        <div
          ref={rowRef}
          onMouseDown={onMouseDown}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-8 md:px-14 pb-3"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            cursor: 'grab',
          }}
        >
          {files.map(file => (
            <div
              key={file.id}
              className="flex-shrink-0"
              style={{
                width: 'clamp(130px, 16vw, 185px)',
                pointerEvents: isDragging ? 'none' : 'auto',
              }}
            >
              <PDFCard
                file={file}
                progress={progresses?.[file.id]}
                thumbnail={thumbnails?.[file.id]}
                isFav={!!(favorites?.[file.id])}
                onOpen={onOpen}
                onToggleFav={onToggleFav}
                onDelete={onDelete}
                onCopy={onCopy}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
