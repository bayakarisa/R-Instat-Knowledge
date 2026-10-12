import { Check, Copy, FileCode2, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

function formatLocation(result) {
  const file = (result.file || 'Local source').split('/').slice(-1)[0]
  return file + (result.line ? ' : ' + result.line : '')
}

export default function ChunkList({ results, onCompare }) {
  if (!results?.length) return null
  return (
    <div className="chunk-list">
      {results.map((result, index) => <ChunkCard key={result.id || result.file + result.line + index} result={result} onCompare={onCompare} />)}
    </div>
  )
}

function ChunkCard({ result, onCompare }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(result.text || '')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1300)
  }
  return (
    <article className="chunk-card">
      <div className="chunk-topline">
        <div className="chunk-location"><FileCode2 size={15} /><span>{formatLocation(result)}</span></div>
        <span className="score">{Math.round((result.score || 0) * 100)}<small>%</small></span>
      </div>
      <div className="chunk-kind">{result.kind || 'code'}{result.name ? <><span className="dot-sep">·</span>{result.name}</> : null}</div>
      <pre className="chunk-code"><code>{result.text}</code></pre>
      <div className="chunk-actions">
        <button className="text-action" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button>
        {onCompare && <button className="text-action" onClick={() => onCompare(result)}><ArrowUpRight size={14} />Compare pattern</button>}
      </div>
    </article>
  )
}
