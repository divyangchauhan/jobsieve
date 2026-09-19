import { useEffect, useState } from 'react';
export function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setIsDark(
      localStorage.getItem('darkMode') === 'true' ||
        (localStorage.getItem('darkMode') === null &&
          window.matchMedia('(prefers-color-scheme: dark)').matches),
    );
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.setItem('darkMode', String(isDark));
    }
  }, [isDark, ready]);
  return { isDark, toggle: () => setIsDark((d) => !d) };
}
