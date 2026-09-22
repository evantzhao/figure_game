import Link from 'next/link';
export default function NotFound(){return <div className="content-page"><h1>This table isn’t here.</h1><p className="muted">The link may be incomplete or the page may have moved.</p><Link href="/" className="button primary" style={{marginTop:20}}>Back to play</Link></div>}
