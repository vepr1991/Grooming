import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Компонент-ловушка для ошибок
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', fontFamily: 'monospace', wordBreak: 'break-word' }}>
          <h1>💥 Что-то сломалось</h1>
          <h3>Ошибка:</h3>
          <pre style={{ background: '#eee', padding: 10, borderRadius: 5, color: '#333' }}>
            {this.state.error?.toString()}
          </pre>
          <h3>Стек:</h3>
          <pre style={{ fontSize: 10, color: '#666' }}>
             {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, padding: '10px 20px', fontSize: 16 }}
          >
            Перезагрузить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Запуск с защитой
const rootElement = document.getElementById('root');

if (!rootElement) {
  document.body.innerHTML = '<div style="color:red">CRITICAL: id="root" not found in index.html</div>';
} else {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (e) {
    rootElement.innerHTML = `<div style="color:red">CRITICAL STARTUP ERROR: ${e}</div>`;
  }
}