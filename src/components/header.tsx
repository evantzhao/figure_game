'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun, ArrowUpRight } from 'lucide-react';
import { useApp } from './providers';
export function Header(){const path=usePathname(),{user,dark,toggleTheme}=useApp();return <header className="site-header"><Link href="/" className="brand"><span className="brand-seal">棋</span><span>figure<span className="brand-light">chess</span><small>THE CHINESE CHESS CLUB</small></span></Link><nav aria-label="Main navigation">{[['/','Play'],['/learn','Learn'],['/history','Your games'],['/leaderboard','Ratings']].map(([href,label])=><Link key={href} href={href} className={(href==='/'?path==='/'||path.startsWith('/game'):path===href)?'active':''}>{label}</Link>)}</nav><div className="header-actions"><button className="icon-button" onClick={toggleTheme} aria-label={dark?'Use light theme':'Use dark theme'}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button><Link href="/account" className="account-link">{user?user.username:'Sign in'}<ArrowUpRight size={15}/></Link></div></header>}
