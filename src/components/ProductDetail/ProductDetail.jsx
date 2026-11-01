import Link from 'next/link';
import ProductPurchase from './ProductPurchase';
import styles from './ProductDetail.module.css';

export default function ProductDetail({ product }) {
  const details = product.details;
  return (
    <main className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/#products">All products</Link><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span>
      </nav>
      <div className={styles.hero}>
        <div className={styles.imagePanel}>
          {product.media.source
            // Local demo SVGs and merchant-hosted media share this view without
            // allowing arbitrary image proxy origins on the Next.js server.
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={product.media.source} alt={product.name} width="800" height="600" className={styles.image} fetchPriority="high" />
            : <p className={styles.imageFallback}>Product image unavailable</p>}
        </div>
        <div className={styles.summary}>
          <p className={styles.eyebrow}>WORK &amp; EVERYDAY</p>
          <h1>{product.name}</h1>
          <p className={styles.price}>{product.price.formatted_with_symbol}</p>
          <p className={styles.overview}>{details?.overview || product.description || 'More product information is coming soon.'}</p>
          <ProductPurchase key={product.id} product={{ id: product.id, name: product.name }} />
          <p className={styles.shipping}>Shipping and tax are shown at checkout before you place your order.</p>
          {details && <p className={styles.disclosure}>Demo product · Specifications and illustrations are sample content for this store.</p>}
        </div>
      </div>
      {details && (
        <div className={styles.details}>
          <section aria-labelledby="features-title">
            <p className={styles.eyebrow}>THOUGHTFULLY SIMPLE</p>
            <h2 id="features-title">Why it works</h2>
            <ul className={styles.features}>{details.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <h2 id="care-title" className={styles.careTitle}>Care</h2>
            <p className={styles.care}>{details.care}</p>
          </section>
          <section aria-labelledby="specifications-title" className={styles.specifications}>
            <h2 id="specifications-title">Specifications</h2>
            <dl>{details.specifications.map(({ label, value }) => (
              <div key={label} className={styles.specification}><dt>{label}</dt><dd>{value}</dd></div>
            ))}</dl>
          </section>
        </div>
      )}
      <div className={styles.back}><Link href="/#products">Explore the full collection <span aria-hidden="true">→</span></Link></div>
    </main>
  );
}
