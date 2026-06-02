'use client';

import { useEffect, useMemo, useState } from 'react';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | undefined {
  if (typeof window === 'undefined') return undefined;

  const win = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };

  return win.SpeechRecognition || win.webkitSpeechRecognition;
}

type TripAssistantVoiceButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

export default function TripAssistantVoiceButton({
  onTranscript,
  disabled = false,
  className = '',
}: TripAssistantVoiceButtonProps) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);

  const recognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);

  useEffect(() => {
    setSupported(Boolean(recognitionCtor));
  }, [recognitionCtor]);

  const handleClick = () => {
    if (!recognitionCtor || disabled) return;

    const recognition = new recognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    setListening(true);
    recognition.start();
  };

  if (!supported) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || listening}
      title={listening ? 'Listening…' : 'Speak your trip'}
      aria-label={listening ? 'Listening for trip description' : 'Start voice input'}
      className={
        'inline-flex items-center gap-2 self-start rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60 ' +
        className
      }
    >
      <span aria-hidden="true">🎤</span>
      {listening ? 'Listening…' : 'Voice input'}
    </button>
  );
}
