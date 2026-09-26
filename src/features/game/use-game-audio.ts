'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type GameSound = 'move' | 'capture' | 'check' | 'start' | 'end';

const MUTE_STORAGE_KEY = 'figure-sound-muted';

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
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function addWoodClick(context: AudioContext, at: number, pitch: number, volume = 0.08) {
  const frames = Math.max(1, Math.floor(context.sampleRate * 0.045));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    const envelope = 1 - index / frames;
    data[index] = (Math.random() * 2 - 1) * envelope * envelope;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = pitch;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(at);
}

function scheduleSound(context: AudioContext, sound: GameSound) {
  const at = context.currentTime + 0.012;
  if (sound === 'move') {
    addWoodClick(context, at, 640);
    addTone(context, at, 155, 0.07, 0.028, 'triangle');
  } else if (sound === 'capture') {
    addWoodClick(context, at, 430, 0.11);
    addWoodClick(context, at + 0.052, 310, 0.075);
    addTone(context, at, 105, 0.12, 0.035, 'triangle');
  } else if (sound === 'check') {
    addWoodClick(context, at, 760, 0.075);
    addTone(context, at, 660, 0.16, 0.045, 'sine');
    addTone(context, at + 0.105, 880, 0.18, 0.04, 'sine');
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

  const playSound = useCallback(
    (sound: GameSound) => {
      if (muted) return;
      const AudioContextClass =
        window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = contextRef.current ?? new AudioContextClass();
      contextRef.current = context;
      if (context.state === 'suspended') void context.resume();
      scheduleSound(context, sound);
    },
    [muted],
  );

  const toggleMuted = useCallback(() => {
    setMuted(current => {
      const next = !current;
      localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      if (next) void contextRef.current?.suspend();
      else void contextRef.current?.resume();
      return next;
    });
  }, []);

  return { muted, playSound, toggleMuted };
}
