// Demo prices are integer cents. These products, specifications, and illustrations
// are local sample fixtures, not claims about physical goods offered for sale.
export const catalog = [
  {
    id: 'demo-desk-mat', permalink: 'desk-mat', name: 'Desk Mat', cents: 3400, image: 'desk-mat',
    description: 'A soft felt surface that brings a little calm to your workspace.',
    details: {
      overview: 'Give your keyboard, mouse, and notebook a shared place to land. The wide felt surface softens the look of your desk while keeping your daily tools together.',
      features: ['Room for a keyboard and mouse side by side', 'Soft felt top with a cork backing', 'A flat profile that slips beneath a notebook'],
      specifications: [
        { label: 'Dimensions', value: '75 × 35 cm' },
        { label: 'Thickness', value: '3 mm' },
        { label: 'Materials', value: 'Polyester felt and cork' },
        { label: 'Color', value: 'Forest green' },
        { label: 'Included', value: 'One desk mat' },
      ],
      care: 'Brush away loose dust and spot-clean with a damp cloth. Let the mat dry flat before putting it back on your desk.',
    },
  },
  {
    id: 'demo-notebook', permalink: 'notebook', name: 'Notebook', cents: 1200, image: 'notebook',
    description: 'A cloth-bound notebook for sketches, meeting notes, and your next idea.',
    details: {
      overview: 'Keep everyday notes and rough ideas in one place. A subtle dot grid gives you enough structure for lists and diagrams while leaving room to sketch.',
      features: ['Dot-grid pages for writing and drawing', 'Cloth cover with a stitched binding', 'Ribbon marker to find your place'],
      specifications: [
        { label: 'Format', value: 'A5 · 14.8 × 21 cm' },
        { label: 'Pages', value: '160 pages / 80 sheets' },
        { label: 'Paper', value: '100 gsm, dot grid' },
        { label: 'Cover', value: 'Terracotta cloth over board' },
        { label: 'Included', value: 'One notebook' },
      ],
      care: 'Keep the notebook dry. Wipe the cover with a soft, dry cloth and store it flat or upright on a shelf.',
    },
  },
  {
    id: 'demo-bottle', permalink: 'bottle', name: 'Bottle', cents: 2800, image: 'bottle',
    description: 'An insulated everyday bottle with a comfortable carry loop.',
    details: {
      overview: 'A reusable bottle for moving between your desk and the rest of your day. The carry loop makes it easy to pick up, and the wide opening gives you room for ice and cleaning.',
      features: ['Double-wall insulated body', 'Screw-top lid with a carry loop', 'Wide opening for easy filling'],
      specifications: [
        { label: 'Capacity', value: '500 ml' },
        { label: 'Dimensions', value: '7 × 24 cm' },
        { label: 'Body', value: 'Stainless steel' },
        { label: 'Color', value: 'Slate blue' },
        { label: 'Included', value: 'One bottle and screw-top lid' },
      ],
      care: 'Hand-wash the bottle and lid with warm soapy water. Rinse thoroughly and leave them open to dry.',
    },
  },
  {
    id: 'demo-tote', permalink: 'tote', name: 'Tote', cents: 2200, image: 'tote',
    description: 'A sturdy cotton companion for groceries, books, and daily essentials.',
    details: {
      overview: 'Carry a few groceries, your reading list, or the things you need for an afternoon out. The open main compartment is easy to pack, and the flat base gives it a little extra room.',
      features: ['Long handles for carrying over a shoulder', 'An inside pocket for small essentials', 'Folds flat between outings'],
      specifications: [
        { label: 'Dimensions', value: '38 × 40 × 10 cm' },
        { label: 'Handle length', value: '62 cm' },
        { label: 'Material', value: 'Cotton canvas' },
        { label: 'Color', value: 'Natural with forest-green print' },
        { label: 'Included', value: 'One tote bag' },
      ],
      care: 'Wash cold on a gentle cycle and reshape while damp. Line-dry instead of tumble-drying.',
    },
  },
  {
    id: 'demo-laptop-stand', permalink: 'laptop-stand', name: 'Laptop Stand', cents: 4800, image: 'laptop-stand',
    description: 'An angled aluminum stand that gives your desk a little more breathing room.',
    details: {
      overview: 'Raise your laptop above the desk and make space for a keyboard below. The fixed-angle design keeps setup simple, with an open area at the back for cables.',
      features: ['Fixed raised platform for a laptop', 'Silicone contact pads at the base and supports', 'Open back for cable routing'],
      specifications: [
        { label: 'Dimensions', value: '25 × 23 × 15 cm' },
        { label: 'Laptop sizes', value: '11–16 inches' },
        { label: 'Materials', value: 'Aluminum and silicone' },
        { label: 'Finish', value: 'Matte silver' },
        { label: 'Included', value: 'One assembled stand' },
      ],
      care: 'Wipe the stand and contact pads with a soft, damp cloth, then dry them before placing a laptop on the supports.',
    },
  },
  {
    id: 'demo-desk-lamp', permalink: 'desk-lamp', name: 'Desk Lamp', cents: 6400, image: 'desk-lamp',
    description: 'A compact task light with a warm finish for focused evenings.',
    details: {
      overview: 'Bring a pool of warm light to your desk or reading corner. An adjustable shade lets you direct it toward the page, while the compact base leaves room for the rest of your setup.',
      features: ['Adjustable shade for directing the light', 'Warm-white integrated LED', 'A simple switch on the base'],
      specifications: [
        { label: 'Dimensions', value: '15 × 18 × 38 cm' },
        { label: 'Light', value: 'Warm white · 3000 K' },
        { label: 'Power', value: 'USB-C · 5 V / 1 A' },
        { label: 'Finish', value: 'Terracotta painted metal' },
        { label: 'Included', value: 'One lamp and USB-C cable; power adapter not included' },
      ],
      care: 'Unplug before cleaning. Dust with a soft, dry cloth and keep the base and cable connection dry.',
    },
  },
];

export const money = (cents) => ({
  raw: cents / 100,
  formatted_with_symbol: `$${(cents / 100).toFixed(2)}`,
});

export const productDetails = (product) => ({
  id: product.id,
  permalink: product.permalink,
  name: product.name,
  description: product.description,
  price: money(product.cents),
  media: { source: `/demo/${product.image}.svg` },
  details: {
    overview: product.details.overview,
    features: [...product.details.features],
    specifications: product.details.specifications.map((specification) => ({ ...specification })),
    care: product.details.care,
  },
});
