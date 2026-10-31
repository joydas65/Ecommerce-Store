import Link from 'next/link';

export default function NotFound() {
  return <main style={{ padding: '7rem 2rem' }}><h1>Page not found</h1><p>We could not find that page.</p><Link href="/">Back to the store</Link></main>;
}
