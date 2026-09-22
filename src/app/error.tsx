'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="content-page"><h1>Let’s reset the position.</h1><p className="muted">This page could not load. Your saved online games are safe.</p><button className="button primary" onClick={reset} style={{marginTop:20}}>Try again</button></div>}
