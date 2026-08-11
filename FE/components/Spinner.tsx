import React from 'react';
import { ImSpinner8 } from 'react-icons/im';

interface SpinnerProps {
  colorClass: string;
  size?: number;
}

const Spinner: React.FC<SpinnerProps> = ({ colorClass, size = 48 }) => {
  return (
    <ImSpinner8
      className={`animate-spin ${colorClass}`}
      style={{ fontSize: size }}
    />
  );
};

export default Spinner;
