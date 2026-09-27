import { useEffect, useState } from 'react';
import { load, save } from '../lib/store.js';

export function useStored(key, fallback) {
  const [value, setValue] = useState(() => load(key, fallback));
  useEffect(() => { save(key, value); }, [key, value]);
  return [value, setValue];
}
