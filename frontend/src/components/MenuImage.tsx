import React, { useState } from 'react';

// Cloudinary can send a smaller copy of the photo (faster on mobile data):
// we add "w_200,h_200,c_fill,f_auto,q_auto" into the link.
export const menuThumb = (url?: string, size = 200) =>
  url && url.includes('res.cloudinary.com') && url.includes('/upload/')
    ? url.replace('/upload/', `/upload/w_${size},h_${size},c_fill,f_auto,q_auto/`)
    : url || '';

// Shows the menu photo. No photo (or it fails to load, e.g. offline) → shows the fallback (category emoji).
// Put it inside a box that has a size and "overflow-hidden".
export default function MenuImage({
  src,
  alt = '',
  fallback,
  size = 200,
  className = '',
}: {
  src?: string;
  alt?: string;
  fallback: React.ReactNode;
  size?: number;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState('');
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    <img
      src={menuThumb(src, size)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}