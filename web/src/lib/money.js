const isFree = price => Number(price) === 0;

const formatPrice = price => isFree(price) ? "Free" : `$${Number(price).toFixed(2)}`;

const formatCents = cents => `$${(cents / 100).toFixed(2)}`;

export { isFree, formatPrice, formatCents }
