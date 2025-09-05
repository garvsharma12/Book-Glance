import React, { useEffect, useState, useRef } from 'react';

interface TypewriterProps {
  text: string;
  typingSpeed?: number;        // ms per character while typing
  deletingSpeed?: number;      // ms per character while deleting
  pauseAfterTyped?: number;    // ms pause after full text typed
  pauseAfterDeleted?: number;  // ms pause after deletion before retyping
  className?: string;
  ariaLabel?: string;
}

// Accessible typewriter effect: screen readers get full text via aria-label
export const Typewriter: React.FC<TypewriterProps> = ({
  text,
  typingSpeed = 55,
  deletingSpeed = 30,
  pauseAfterTyped = 1800,
  pauseAfterDeleted = 500,
  className = '',
  ariaLabel
}) => {
  const [displayed, setDisplayed] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [caretVisible, setCaretVisible] = useState(true);
  const timeoutRef = useRef<number | null>(null);
  const caretIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Blinking caret
    caretIntervalRef.current = window.setInterval(() => {
      setCaretVisible(v => !v);
    }, 550);
    return () => {
      if (caretIntervalRef.current) window.clearInterval(caretIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const full = text;

    const schedule = (fn: () => void, delay: number) => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(fn, delay);
    };

    if (!isDeleting && displayed.length < full.length) {
      schedule(() => setDisplayed(full.slice(0, displayed.length + 1)), typingSpeed);
    } else if (!isDeleting && displayed.length === full.length) {
      schedule(() => setIsDeleting(true), pauseAfterTyped);
    } else if (isDeleting && displayed.length > 0) {
      schedule(() => setDisplayed(full.slice(0, displayed.length - 1)), deletingSpeed);
    } else if (isDeleting && displayed.length === 0) {
      schedule(() => setIsDeleting(false), pauseAfterDeleted);
    }

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [displayed, isDeleting, text, typingSpeed, deletingSpeed, pauseAfterTyped, pauseAfterDeleted]);

  return (
    <span className={className} aria-label={ariaLabel || text} role="text">
      {displayed}
      <span
        aria-hidden="true"
  className={`inline-block w-[2px] ml-0.5 align-middle ${caretVisible ? 'opacity-80' : 'opacity-0'} bg-orange-500 dark:bg-orange-400 h-[1.15em] translate-y-[-2px]`}
      />
    </span>
  );
};

export default Typewriter;
