import { Search } from 'lucide-react'

export default function SearchBox({ value, onChange, onSubmit, busy = false, placeholder = 'Search R-Instat code, controls, functions…' }) {
  return (
    <form className="search-box" onSubmit={onSubmit}>
      <Search size={19} strokeWidth={1.8} aria-hidden="true" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label="Search local R-Instat knowledge" />
      <span className="shortcut">Ctrl K</span>
      <button className="search-submit" type="submit" disabled={busy || !value.trim()}>{busy ? 'Searching…' : 'Search'}</button>
    </form>
  )
}
