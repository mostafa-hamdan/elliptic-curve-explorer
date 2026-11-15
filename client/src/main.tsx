/**
 * Starting point of the website: loads the bundled fonts and the stylesheet, then
 * mounts the React app into the page.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled with the app (no request to another site): Inter for text,
// JetBrains Mono for numbers.
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import { App } from './App.tsx';

const container = document.getElementById('root');
if (!container) {
  throw new Error('The page is missing its #root element.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
