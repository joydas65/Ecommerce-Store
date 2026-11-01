// Demo prices are integer cents. These products and illustrations are local
// fixtures, so exploring the store never depends on a merchant or image host.
export const catalog = [
  { id: 'demo-desk-mat', name: 'Desk Mat', cents: 3400, image: 'desk-mat', description: 'A soft felt surface that brings a little calm to your workspace.' },
  { id: 'demo-notebook', name: 'Notebook', cents: 1200, image: 'notebook', description: 'A cloth-bound notebook for sketches, meeting notes, and your next idea.' },
  { id: 'demo-bottle', name: 'Bottle', cents: 2800, image: 'bottle', description: 'An insulated everyday bottle with a comfortable carry loop.' },
  { id: 'demo-tote', name: 'Tote', cents: 2200, image: 'tote', description: 'A sturdy cotton companion for groceries, books, and daily essentials.' },
  { id: 'demo-laptop-stand', name: 'Laptop Stand', cents: 4800, image: 'laptop-stand', description: 'An angled aluminum stand that gives your desk a little more breathing room.' },
  { id: 'demo-desk-lamp', name: 'Desk Lamp', cents: 6400, image: 'desk-lamp', description: 'A compact task light with a warm finish for focused evenings.' },
];

export const money = (cents) => ({
  raw: cents / 100,
  formatted_with_symbol: `$${(cents / 100).toFixed(2)}`,
});

export const productDetails = (product) => ({
  id: product.id,
  name: product.name,
  description: product.description,
  price: money(product.cents),
  media: { source: `/demo/${product.image}.svg` },
});
