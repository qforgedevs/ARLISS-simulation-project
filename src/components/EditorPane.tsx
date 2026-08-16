import { lazy, Suspense } from 'react';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

type EditorPaneProps = Readonly<{
  source: string;
  onChange: (source: string) => void;
}>;

export function EditorPane({ source, onChange }: EditorPaneProps) {
  return (
    <section className="panel editor-panel" aria-labelledby="editor-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Controller</p>
          <h2 id="editor-heading">Python navigation algorithm</h2>
        </div>
        <span className="language-badge">Python</span>
      </div>
      <p className="panel-help">
        Define <code>initialize(mission)</code> and <code>update(readings)</code> to return{' '}
        <code>MotorCommand(left, right)</code>.
      </p>
      <div className="editor-shell" data-testid="python-editor">
        <Suspense
          fallback={
            <textarea
              aria-label="Python navigation algorithm"
              value={source}
              onChange={(event) => onChange(event.target.value)}
            />
          }
        >
          <MonacoEditor
            height="100%"
            defaultLanguage="python"
            theme="vs-dark"
            value={source}
            onChange={(value) => onChange(value ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbersMinChars: 3,
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
            }}
          />
        </Suspense>
      </div>
    </section>
  );
}
