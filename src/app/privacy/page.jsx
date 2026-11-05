import Link from 'next/link';
import styles from '../../components/Account/Account.module.css';

export const metadata = {
  title: 'Privacy',
  description: 'How Joy’s Store uses sign-in information, test orders and cookies, and how to request account deletion.',
};

export default function PrivacyPage() {
  return <main className={styles.workspace} style={{ maxWidth: 850 }}>
    <p className={styles.eyebrow}>Joy’s Store / Privacy</p>
    <h1 className={styles.heading} style={{ marginTop: 22 }}>Privacy at Joy’s Store</h1>
    <p className={styles.intro}>This portfolio store uses sample products, simulated orders and Stripe test payments. No real money is charged and nothing is shipped. Use fictitious checkout details.</p>
    <div className={styles.orders}>
      <section className={styles.state} aria-labelledby="privacy-google">
        <h2 id="privacy-google">Google sign-in</h2>
        <p>Google shares your account identifier, name, email address, email verification status and profile image when available. We use this information to recognize your account, sign you in and display your name. We request only basic identity, email and profile access.</p>
        <p>Account records also contain provider identifiers and sign-in tokens. Stored OAuth access and refresh tokens are encrypted. Session records can include an IP address, browser details and expiry time.</p>
      </section>
      <section className={styles.state} aria-labelledby="privacy-orders">
        <h2 id="privacy-orders">Your account and orders</h2>
        <p>Shopper and merchant access are separate. Shopper sign-in does not grant merchant access. An approved merchant must sign in with GitHub before linking a Google account.</p>
        <p>New orders placed while signed in are associated with that shopper account. Earlier guest orders are not imported. We store products, quantities, prices, shipping method, totals, payment status and payment references to provide receipts and recover test payments. The authorized merchant can review these order records.</p>
        <p>The sample checkout uses the address and contact details you enter during that checkout; it does not save them in the store’s order database. Information entered on Stripe’s hosted test checkout is processed by Stripe.</p>
      </section>
      <section className={styles.state} aria-labelledby="privacy-cookies">
        <h2 id="privacy-cookies">Cookies and browser storage</h2>
        <p>Cookies keep you signed in and restrict access to receipts. Shopper and merchant sessions last eight hours. Signing out revokes the selected session.</p>
        <p>A guest receipt cookie lasts 30 days and is refreshed during checkout. Browser storage keeps your cart and checkout recovery information. Signing out does not remove that cookie or clear the cart and recovery information. Clearing browser data can remove access to guest receipts.</p>
      </section>
      <section className={styles.state} aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">How long information remains</h2>
        <p>Resolved order receipts are available for 30 days after purchase or payment resolution. Scheduled cleanup removes expired order records. Unresolved Stripe test orders remain while payment is pending or needs review.</p>
        <p>Account identities and linked provider records remain until the store owner processes a deletion request. They are not automatically deleted when an order expires. Expired sessions and temporary sign-in state are cleaned up separately.</p>
      </section>
      <section className={styles.state} aria-labelledby="privacy-services">
        <h2 id="privacy-services">Services used by the store</h2>
        <p>Vercel hosts the storefront and API. Neon stores account, session and order records. Google provides sign-in. Stripe hosts test checkout and processes sandbox payment information. These services receive information needed to provide those features and may maintain their own operational records.</p>
      </section>
      <section className={styles.state} aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">Questions and account deletion</h2>
        <p>Contact the store owner at <a href="mailto:joydas.0111@gmail.com">joydas.0111@gmail.com</a> for privacy questions or to request account deletion. Deletion requests are handled manually; there is no self-service deletion screen.</p>
        <p>Signing out or removing the app’s access in Google does not itself delete information already stored by the store.</p>
      </section>
    </div>
    <nav className={styles.pagination} aria-label="Privacy page navigation">
      <Link href="/account/sign-in">Account sign-in</Link>
      <Link href="/">Continue shopping</Link>
    </nav>
  </main>;
}
