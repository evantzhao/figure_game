'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
export type User = {id:string;username:string;rating:number;rated_games:number};
type AppContext = {user:User|null;online:boolean;loading:boolean;refresh:()=>Promise<void>;dark:boolean;toggleTheme:()=>void};
const Context=createContext<AppContext|null>(null);
export async function api<T>(path:string, data?:unknown):Promise<T> {
  const response=await fetch(`/api/${path}`,{method:data===undefined?'GET':'POST',headers:data===undefined?undefined:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
  const value=await response.json(); if(!response.ok) throw new Error(value.error||'Request failed.'); return value as T;
}
export function Providers({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null),[online,setOnline]=useState(false),[loading,setLoading]=useState(true),[dark,setDark]=useState(false);
  async function refresh(){try {const status=await api<{online:boolean}>('status');setOnline(status.online);if(status.online)setUser((await api<{user:User|null}>('me')).user);}finally{setLoading(false);}}
  useEffect(()=>{void refresh().catch(()=>setLoading(false));const saved=localStorage.getItem('figure-theme');setDark(saved==='dark'||(!saved&&matchMedia('(prefers-color-scheme: dark)').matches));},[]);
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';},[dark]);
  function toggleTheme(){setDark(value=>{localStorage.setItem('figure-theme',value?'light':'dark');return !value;});}
  return <Context.Provider value={{user,online,loading,refresh,dark,toggleTheme}}>{children}</Context.Provider>;
}
export function useApp(){const value=useContext(Context);if(!value)throw new Error('Missing app context');return value;}
