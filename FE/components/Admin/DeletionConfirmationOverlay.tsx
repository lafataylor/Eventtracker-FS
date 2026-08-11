import { useEffect } from 'react';

interface DeletionConfirmationOverlayProps {
  result: {
    success: boolean;
    count: number;
    error: string | null;
  };
  itemType: string;
  onClose: () => void;
}

const DeletionConfirmationOverlay: React.FC<
  DeletionConfirmationOverlayProps
> = ({ result, itemType, onClose }) => {
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (result.success || result.error) {
      timer = setTimeout(() => {
        onClose();
      }, 2000); // Overlay will disappear after 2 seconds
    }
    return () => clearTimeout(timer);
  }, [result, onClose]);

  return (
    <div
      className={`w-1/2 fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-6 bg-slate-black flex flex-row justify-between items-center shadow-[8px_8px_32px_rgba(0,0,0,0.25)] shadow-transparent-black rounded-2xl z-[8] ${
        !result.success && !result.error && 'hidden'
      }`}
    >
      <div className="flex flex-row items-center gap-4">
        {result.error ? (
          <span className="text-off-white text-base">
            Error deleting {itemType}: {result.error}
          </span>
        ) : (
          <>
            <span className="text-off-white text-xl">{result.count}</span>
            <span className="text-off-white ">
              {itemType}(s) deleted successfully.
            </span>
          </>
        )}
      </div>
      <button
        onClick={onClose}
        className="border-slate-black text-black border-[1px] bg-beaming-orange font-bold py-2 px-8 rounded-lg"
      >
        Close
      </button>
    </div>
  );
};

export default DeletionConfirmationOverlay;
