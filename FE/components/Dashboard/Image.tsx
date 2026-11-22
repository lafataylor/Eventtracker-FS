import React from 'react';

interface ImageProps {
  baseImageUrl: any;
}

/** Renders a direct image URL. Unused by ImageDialog (which uses orig_thumb). */
const Image = ({ baseImageUrl }: ImageProps) => {
  const src =
    typeof baseImageUrl === 'string'
      ? baseImageUrl
      : baseImageUrl?.baseImageURL || baseImageUrl?.baseImageUrl || '';

  return (
    <img
      className="w-full pb-1 rounded-xl flex-1"
      src={src}
      alt="Instagram Image"
    />
  );
};

export default Image;
