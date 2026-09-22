import { z } from 'zod';
import type { Color, GameState } from './xiangqi/rules';
export const moveSchema = z.object({ from: z.number().int().min(0).max(89), to: z.number().int().min(0).max(89) }).strict();
export const accountSchema = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, 'Use 3–20 letters, numbers, or underscores.'), password: z.string().min(12, 'Use at least 12 characters.').max(128) }).strict();
export const commandSchema = z.object({ commandId: z.uuid(), version: z.number().int().min(0), action: z.enum(['move','resign','offer-draw','accept-draw','decline-draw','cancel']), move: moveSchema.optional() }).strict();
export type Command = z.infer<typeof commandSchema>;
export type OnlineGame = { id: string; red_id: string; black_id: string | null; red_name: string; black_name: string | null; status: 'waiting' | 'active' | 'finished' | 'review' | 'aborted'; state: GameState; version: number; red_ms: number; black_ms: number; turn_started: number | null; winner: Color | null; reason: string | null; draw_by: string | null; rated: boolean; ruleset: string; created_at: string; serverNow: number };
export type HistoryGame = { id: string; label: string; kind: 'online' | 'practice'; created_at: string; status: string; reason: string | null; moves: {from:number;to:number}[]; winner: Color | null; };
