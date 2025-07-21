import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const App: React.FC = () => {
  return (
    <div className="app">
      <nav className="nav">
        <h1>Mysews</h1>
      </nav>
      <main className="main-content">
        <p>AIパーソナライズRSSニュースリーダー</p>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
