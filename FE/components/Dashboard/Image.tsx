import React from 'react';

interface ImageProps {
  baseImageUrl: any;
}

/**
 * Legacy Instagram→Firebase→vision helper UI.
 *
 * 2026-11-19: /api/getImage was removed for Cursor Publish (SSRF / paid API).
 * ImageDialog shows Firebase orig_thumb URLs directly; this component is unused
 * but kept as a no-op so old imports do not call a proxy.
 */
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
