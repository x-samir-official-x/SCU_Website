import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './identity.css';
import './motion.css';
import { preparePreview } from './preview-bootstrap';

preparePreview()
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    ),
  )
  .catch((error) => {
    const root = document.getElementById('root')!;
    const message = document.createElement('p');
    message.textContent = error instanceof Error ? error.message : 'تعذر تحميل التطبيق.';
    const retry = document.createElement('button');
    retry.textContent = 'إعادة المحاولة';
    retry.className = 'button primary';
    retry.onclick = () => location.reload();
    root.className = 'error-panel';
    root.append(message, retry);
  });
