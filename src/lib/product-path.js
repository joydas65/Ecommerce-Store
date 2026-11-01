export const productPath = (product) => `/products/${encodeURIComponent(product.permalink || product.id)}`;
