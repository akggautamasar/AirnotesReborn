import React from 'react';
import { Search } from 'lucide-react';
import PDFCard from './PDFCard';

export default function SearchOverlay({ results, query, thumbnails, progresses, favorites, onOpen, onToggleFav }) {
  return (
    <div className="min-h-screen px-8 md:px-14 pt-6 pb-16">
      <div className="flex items-center gap-3 mb-6">
        <Search size={16} className="text-gray-500" />
        <p className="text-gray-400 text-sm">
          {results.length === 0
            ? `No results for "${query}"`
            : `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`}
        </p>
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map(file => (
            <PDFCard
              key={file.id}
              file={file}
              progress={progresses?.[file.id]}
              thumbnail={thumbnails?.[file.id]}
              isFav={!!(favorites?.[file.id])}
              onOpen={onOpen}
              onToggleFav={onToggleFav}
            />
          ))}
        </div>
      )}

      {results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Search size={32} className="text-gray-600" />
          </div>
          <p className="text-gray-500 text-lg font-medium mb-2">No notes found</p>
          <p className="text-gray-700 text-sm">Try a different search term</p>
        </div>
      )}
    </div>
  );
}
