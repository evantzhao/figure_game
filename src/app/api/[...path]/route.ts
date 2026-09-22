import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { accountSchema, commandSchema, moveSchema } from '@/domain/contracts';
import { RATED_AVAILABLE } from '@/domain/xiangqi/rules';
import { authenticate, register, login, logout, rateLimit, SESSION_COOKIE, SESSION_SECONDS, digest } from '@/server/auth';
import { getDb, backendConfigured, ServiceError } from '@/server/db';
import * as games from '@/server/games';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private' };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
async function body(request: NextRequest): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ServiceError(415,'Send JSON.');
  const text=await request.text(); if (text.length>50000) throw new ServiceError(413,'Request is too large.');
  try { return JSON.parse(text); } catch { throw new ServiceError(400,'Invalid JSON.'); }
}
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const {path}=await context.params, route=path.join('/'), mutation=request.method==='POST';
    if (mutation && request.headers.get('origin') !== request.nextUrl.origin) throw new ServiceError(403,'This request must come from the same site.');
    if (route==='status' && !mutation) return json({online:backendConfigured(),rated:RATED_AVAILABLE});
    if (route==='maintenance' && mutation) {
      const secret=process.env.CRON_SECRET;
      if(!secret || secret.length<32 || digest(request.headers.get('authorization')||'')!==digest(`Bearer ${secret}`)) throw new ServiceError(401,'Unauthorized.');
      return json(await games.sweep(await getDb()));
    }
    const db=await getDb(), token=request.cookies.get(SESSION_COOKIE)?.value;
    const user=await authenticate(db,token);
    if(route==='me' && !mutation) return json({user});
    if((route==='register'||route==='login') && mutation) {
      const input=accountSchema.parse(await body(request));
      const ip=process.env.VERCEL ? request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown' : 'local';
      await rateLimit(db,`auth-ip:${digest(ip)}`,20,60000);
      await rateLimit(db,`auth-user:${input.username}`,10,60000);
      const result=await (route==='register'?register:login)(db,input.username,input.password);
      const response=json({user:result.user}); response.cookies.set(SESSION_COOKIE,result.token,{httpOnly:true,secure:request.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:SESSION_SECONDS}); return response;
    }
    if(route==='logout' && mutation) { await logout(db,token); const response=json({ok:true});response.cookies.set(SESSION_COOKIE,'',{path:'/',maxAge:0,httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:'}); return response; }
    if(route==='leaderboard' && !mutation) return json({players:await games.leaderboard(db),rated:RATED_AVAILABLE});
    if(path[0]==='invite' && path.length===2 && !mutation) return json(await games.invitation(db,z.uuid().parse(path[1])));
    if(!user) throw new ServiceError(401,'Sign in to play online and save your games.');
    await rateLimit(db,`requests:${user.id}`,180,60000);
    if(route==='challenge' && mutation) return json(await games.createChallenge(db,user.id));
    if(route==='queue' && mutation) { const input=z.object({cancel:z.boolean().optional(),rated:z.boolean().optional()}).strict().parse(await body(request)); return json(await games.queue(db,user.id,input.cancel,input.rated)); }
    if(route==='history' && !mutation) return json({games:await games.history(db,user.id,z.coerce.number().int().min(0).max(10000).parse(request.nextUrl.searchParams.get('offset')||0))});
    if(route==='practice' && mutation) { const input=z.object({id:z.uuid(),moves:z.array(moveSchema).max(1000),label:z.string().min(1).max(80)}).strict().parse(await body(request));return json(await games.savePractice(db,user.id,input.id,input.moves,input.label)); }
    if(path[0]==='games' && path.length>=2 && path.length<=3) {
      const id=z.uuid().parse(path[1]);
      if(path.length===2 && !mutation) return json(await games.getGame(db,user.id,id));
      if(path[2]==='join' && mutation) return json(await games.joinGame(db,user.id,id));
      if(path[2]==='command' && mutation) return json(await games.command(db,user.id,id,commandSchema.parse(await body(request))));
    }
    throw new ServiceError(404,'Not found.');
  } catch(error) {
    if(error instanceof z.ZodError) return json({error:error.issues[0]?.message||'Invalid input.'},400);
    if(error instanceof ServiceError) return json({error:error.message},error.status);
    console.error('Request failed', error instanceof Error ? error.name : 'Unknown error');
    return json({error:'The service could not complete this request. Please try again.'},500);
  }
}
export const GET=handle;
export const POST=handle;
