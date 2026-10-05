import React from 'react';

const PLACEHOLDER = '/product-placeholder.svg';

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className }) => (
  <img
    src={src?.trim() || PLACEHOLDER}
    alt={alt}
    className={className}
    loading="lazy"
    onError={(event) => {
      const image = event.currentTarget;
      if (image.dataset.fallbackApplied !== 'true') {
        image.dataset.fallbackApplied = 'true';
        image.src = PLACEHOLDER;
      }
    }}
  />
);
