import { Sparkles, ArrowRight, LoaderCircle } from 'lucide-react'

export default function GenerateButton({ children = 'Research with Gemini', onClick, disabled, busy }) {
  return <button className="button-primary" type="button" onClick={onClick} disabled={disabled || busy}>
    {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
    {busy ? 'Working…' : children}
    {!busy && <ArrowRight size={16} />}
  </button>
}
