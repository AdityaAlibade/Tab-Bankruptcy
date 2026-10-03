import React, { useState } from 'react';
import { testLocalAI } from '../api';

export const AITestCard: React.FC = () => {
  const [inputText, setInputText] = useState(
    'GitHub is a website used for software development and source code collaboration.'
  );
  const [response, setResponse] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTestAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await testLocalAI(inputText);
      setResponse(result.response);
      setModelUsed(result.model || 'qwen2.5-coder:7b');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Unexpected error during AI inference');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="ai-test-card" aria-label="Local AI Connection Test">
      <div className="ai-test-header">
        <div className="ai-title-row">
          <span className="ai-badge-icon">🤖</span>
          <h2 className="ai-card-title">Local AI Test</h2>
        </div>
        <span className="ai-tag">qwen2.5-coder:7b via Ollama (Local)</span>
      </div>

      <form onSubmit={handleTestAI} className="ai-test-form">
        <div className="ai-input-wrap">
          <label htmlFor="ai-prompt-input" className="ai-input-label">
            Test prompt:
          </label>
          <textarea
            id="ai-prompt-input"
            className="ai-textarea"
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to classify or summarize..."
            disabled={isLoading}
          />
        </div>

        <div className="ai-actions-row">
          <button
            type="submit"
            className="btn-test-ai"
            disabled={isLoading || !inputText.trim()}
          >
            {isLoading ? (
              <>
                <span className="ai-spinner">⏳</span> Generating response...
              </>
            ) : (
              'Test Local AI'
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="ai-error-box" role="alert">
          <span className="ai-error-icon">⚠️</span>
          <div className="ai-error-content">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {response && (
        <div className="ai-response-box">
          <div className="ai-response-header">
            <span className="ai-response-label">AI Response:</span>
            {modelUsed && <span className="ai-model-badge">Model: {modelUsed}</span>}
          </div>
          <p className="ai-response-text">{response}</p>
        </div>
      )}
    </section>
  );
};
