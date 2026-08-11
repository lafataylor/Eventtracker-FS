import React from 'react';

interface BottomDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const BottomDrawer: React.FC<BottomDrawerProps> = ({
  isOpen,
  onClose,
  children,
}) => {
  return (
    <>
      {/* BACKDROP */}
      <div
        className={`
          fixed inset-0 z-40
          bg-black bg-opacity-50
          transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
      />

      {/* DRAWER */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-50
          p-4 rounded-t-2xl bg-white
          transform transition-transform duration-300
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
      >
        {/* Optional pull-handle */}
        <div className="flex items-center justify-center mb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        {children}
      </div>
    </>
  );
};

export default BottomDrawer;
