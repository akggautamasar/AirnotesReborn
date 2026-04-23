import React, { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { api } from '../utils/api';
import PDFReader from '../components/reader/PDFReader';
import VideoPlayer from '../components/reader/VideoPlayer';
import NetflixHome from '../components/netflix/NetflixHome';

export default function MainApp() {
  const { state, actions } = useApp();

  useEffect(() => {
    api.verify().catch(() => actions.logout());
  }, []);

  const showPDF   = state.openFile && (state.openFile.type || 'pdf') === 'pdf';
  const showVideo = state.openFile && state.openFile.type === 'video';

  return (
    <>
      <div className={state.openFile ? 'hidden' : 'block'}>
        <NetflixHome />
      </div>
      {showPDF   && <PDFReader />}
      {showVideo && <VideoPlayer />}
    </>
  );
}
