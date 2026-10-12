import { ExternalLink, Sparkles, ShieldCheck } from 'lucide-react'

export default function AnswerView({ text, sources = [], mode = 'research', error }) {
  if (!text && !error) return null
  const blocks = (text || '').split(/```/g)
  return <section className="answer-panel">
    <div className="answer-label"><span className="answer-icon"><Sparkles size={14} /></span><span>{mode === 'judge' ? 'Gemini review' : 'From web research'}</span><span className="verify-pill"><ShieldCheck size={12} />{mode === 'judge' ? 'AI findings · verify' : 'Verify before use'}</span></div>
    {error ? <p className="error-message">{error}</p> : <div className="answer-copy">{blocks.map((block, index) => index % 2 ? <pre className="answer-code" key={index}><code>{block.replace(/^\w+\n/, '')}</code></pre> : <p key={index}>{block.trim()}</p>)}</div>}
    {sources.length > 0 && <div className="sources"><span className="sources-title">Sources</span>{sources.map((source, index) => <a key={source.url || index} href={source.url} target="_blank" rel="noreferrer">{source.title || new URL(source.url).hostname}<ExternalLink size={12} /></a>)}</div>}
  </section>
}
