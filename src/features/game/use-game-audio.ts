'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type GameSound = 'move' | 'capture' | 'check' | 'start' | 'end';

const MUTE_STORAGE_KEY = 'figure-sound-muted';
const clickBuffers = new WeakMap<AudioContext, AudioBuffer>();

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function addTone(
  context: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function clickBuffer(context: AudioContext) {
  const cached = clickBuffers.get(context);
  if (cached) return cached;
  const frames = Math.max(1, Math.floor(context.sampleRate * 0.025));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    data[index] = (Math.random() * 2 - 1) * Math.exp(-7 * index / frames);
  }
  clickBuffers.set(context, buffer);
  return buffer;
}

// Original synthesized piece clicks: a sharp contact with a very short wooden body.
function addWoodClick(context: AudioContext, at: number, pitch: number, volume = 0.3) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = pitch;
  filter.Q.value = 0.7;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
  source.buffer = clickBuffer(context);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(at);
}

function scheduleSound(context: AudioContext, sound: GameSound) {
  const at = context.currentTime;
  if (sound === 'move') {
    addWoodClick(context, at, 1900);
    addTone(context, at, 520, 0.028, 0.045, 'triangle');
  } else if (sound === 'capture') {
    addWoodClick(context, at, 1200, 0.4);
    addWoodClick(context, at + 0.016, 2400, 0.24);
    addTone(context, at, 360, 0.04, 0.055, 'triangle');
  } else if (sound === 'check') {
    addWoodClick(context, at, 1900);
    addTone(context, at + 0.04, 880, 0.075, 0.035, 'sine');
    addTone(context, at + 0.1, 1175, 0.08, 0.03, 'sine');
  } else if (sound === 'start') {
    addTone(context, at, 330, 0.16, 0.035, 'triangle');
    addTone(context, at + 0.075, 440, 0.17, 0.04, 'triangle');
    addTone(context, at + 0.15, 550, 0.2, 0.045, 'triangle');
  } else {
    addTone(context, at, 440, 0.2, 0.045, 'triangle');
    addTone(context, at + 0.1, 330, 0.22, 0.04, 'triangle');
    addTone(context, at + 0.2, 220, 0.28, 0.05, 'triangle');
  }
}

export function useGameAudio() {
  const [muted, setMuted] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setMuted(localStorage.getItem(MUTE_STORAGE_KEY) === 'true');
    return () => {
      const context = contextRef.current;
      contextRef.current = null;
      if (context) void context.close();
    };
  }, []);

  // Called directly from board input so the browser can unlock audio before a move.
  const prepareAudio = useCallback(
    () => {
      if (muted) return null;
      const AudioContextClass =
        window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!AudioContextClass) return null;
      const context = contextRef.current ?? new AudioContextClass({ latencyHint: 'interactive' });
      contextRef.current = context;
      clickBuffer(context);
      if (context.state === 'suspended') void context.resume().catch(() => {
        // A browser policy may still block audio; the next user gesture retries.
      });
      return context;
    },
    [muted],
  );

  const playSound = useCallback((sound: GameSound) => {
    const context = prepareAudio();
    if (context) scheduleSound(context, sound);
  }, [prepareAudio]);

  const toggleMuted = useCallback(() => {
    setMuted(current => {
      const next = !current;
      localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      if (next) void contextRef.current?.suspend();
      else void contextRef.current?.resume();
      return next;
    });
  }, []);

  return { muted, playSound, toggleMuted, prepareAudio };
}
