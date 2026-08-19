import { useEffect, useMemo, useState } from 'react';
import type { OpeningBook, OpeningIdentification } from '@papfish/core';
import { loadOpeningBook } from '@/openings/openingBook';

export function useOpeningBook(): OpeningBook | null {
  const [book, setBook] = useState<OpeningBook | null>(null);

  useEffect(() => {
    let active = true;
    loadOpeningBook().then((loaded) => {
      if (active) setBook(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  return book;
}

/** Identify the opening for a sequence of positions (FEN after each ply). */
export function useOpeningIdentification(fens: string[]): OpeningIdentification | null {
  const book = useOpeningBook();
  return useMemo(() => (book ? book.identifyFromFens(fens) : null), [book, fens]);
}
