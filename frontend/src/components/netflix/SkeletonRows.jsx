import React from 'react';

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 rounded-xl overflow-hidden" style={{ width: 'clamp(130px, 16vw, 185px)' }}>
      <div className="shimmer rounded-xl" style={{ paddingBottom: '130%', background: '#1a1a1a', position: 'relative' }}>
        <div className="absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(90deg, #1a1a1a 25%, #222 50%, #1a1a1a 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
      </div>
      <div className="p-3 space-y-1.5">
        <div className="h-2.5 w-4/5 rounded-full" style={{ background: '#1e1e1e' }} />
        <div className="h-2 w-1/2 rounded-full" style={{ background: '#1a1a1a' }} />
      </div>
    </div>
  );
}

export default function SkeletonRows({ count = 3 }) {
  return (
    <div className="space-y-8">
      {Array.from({ length: count }).map((_, i) => (
        <section key={i} className="px-8 md:px-14">
          <div className="h-5 w-36 rounded-full bg-[#1a1a1a] mb-4 shimmer" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 8 }).map((_, j) => (
              <SkeletonCard key={j} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
