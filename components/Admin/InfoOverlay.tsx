import React, { useEffect } from 'react';

interface InfoOverlayProps {
  message: string;
  dynamicValue?: string | null;
  language?: string;
  onClose: () => void;
}

const InfoOverlay: React.FC<InfoOverlayProps> = ({
  message,
  dynamicValue,
  onClose,
  language = 'en',
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    window.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-[50vh] min-w-[90%] md:min-w-[40%] left-1/2 -translate-x-1/2 px-8 py-6 bg-slate-black flex flex-row justify-between gap-5 items-center shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-overlay_shadow rounded-2xl z-[50] border border-[1px] border-midnight ${
        !message && 'hidden'
      }`}
    >
      <span className="text-off-white text-xs  md:text-base flex flex-row items-center gap-3">
        {dynamicValue ? (
          <>
            <span className="text-off-white text-2xl font-semibold">
              {dynamicValue}
            </span>
            {message}
          </>
        ) : (
          message
        )}
      </span>
      <button
        onClick={onClose}
        className="border-slate-black text-xs  md:text-base text-black border-[1px] bg-beaming-orange font-bold py-2 px-8 rounded-lg"
      >
        {language === 'es' ? 'Cerrar' : 'Close'}
      </button>
    </div>
  );
};

export default InfoOverlay;
