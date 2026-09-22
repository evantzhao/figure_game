import { notFound } from 'next/navigation';
import { z } from 'zod';
import { GameRoom } from '@/features/game/game-room';
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;if(!z.uuid().safeParse(id).success)notFound();return <GameRoom gameId={id}/>;}
