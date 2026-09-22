import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import './globals.css';
export const metadata: Metadata={title:{default:'Figure Chess — Play Xiangqi',template:'%s · Figure Chess'},description:'A thoughtful place to play Chinese chess. Practice against the computer, challenge a friend, and learn the board.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><Providers><Header/><main>{children}</main><footer className="site-footer"><span>FIGURE CHESS <span className="footer-dot">·</span> 象棋</span><span>One river. Endless possibilities.</span><a href="https://github.com/evantzhao/figure_game" target="_blank" rel="noreferrer">Prototype · source ↗</a></footer></Providers></body></html>}
