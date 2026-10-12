import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Braces, CheckCircle2, ChevronRight, Circle, Code2, Database, Download, FilePlus2, FlaskConical, HardDrive, Search, ShieldCheck, Sparkles, Wifi } from 'lucide-react'
import SearchBox from './SearchBox.jsx'
import ChunkList from './ChunkList.jsx'
import GenerateButton from './GenerateButton.jsx'
import AnswerView from './AnswerView.jsx'

const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'
const STARTER_CODE = `Private Sub InitialiseDialog()
    ucrCheckAddLabels.SetText("Add labels")

    If ucrCheckAddLabels.Checked Then
        ucrPnlOptions.Visible = True
    End If
End Sub`
const DIALOG_TEMPLATE = `Imports System.Windows.Forms

Public Class dlgNewDialog
    Inherits Form

    ' 1. State flags
    Private bFirstLoad As Boolean = True
    Private bRCodeSet As Boolean = True
    Private bReset As Boolean = True

    ' 2. Constants
    Private ReadOnly strDialogTitle As String = "New dialog"

    ' 3. R syntax objects
    ' Declare RFunction, ROperator, or RParameter objects here.

    ' 4. Collections (dictionaries)
    ' Declare collections here when the dialog needs them.

    ' 5. Load event
    Private Sub dlgNewDialog_Load(sender As Object, e As EventArgs) Handles MyBase.Load
        If bFirstLoad Then
            InitialiseDialog()
            bFirstLoad = False
        End If
        If bReset Then
            SetDefaults()
            SetRCodeForControls()
            bReset = False
        End If
    End Sub

    ' 6. InitialiseDialog()
    Private Sub InitialiseDialog()
        Text = strDialogTitle
    End Sub

    ' 7. SetDefaults()
    Private Sub SetDefaults()
        ' Create or reset R syntax objects here; do not configure controls.
    End Sub

    ' 8. SetRCodeForControls()
    Private Sub SetRCodeForControls()
        ' Link controls to R syntax here.
    End Sub

    ' 9. Validation methods
    Private Sub TestOkEnabled()
        ' Keep validation in this method and its helpers.
    End Sub

    ' 10. Event handlers
    ' Keep control event handlers here.

    ' 11. Helper methods
    ' Keep supporting methods here.
End Class`

async function apiPost(path, data) {
  const response = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  if (!response.ok) throw new Error('The local service returned ' + response.status + '.')
  return response
}

function getError(error) {
  return error?.message?.includes('Failed to fetch')
    ? 'Can’t reach the local service. Start the backend, then try again.'
    : (error?.message || 'Something went wrong. Please try again.')
}

function App() {
  const [tab, setTab] = useState('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchMeta, setSearchMeta] = useState(null)
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [code, setCode] = useState(STARTER_CODE)
  const [fileName, setFileName] = useState('dlgNewDialog.vb')
  const [compareResults, setCompareResults] = useState([])
  const [compareMeta, setCompareMeta] = useState(null)
  const [compareBusy, setCompareBusy] = useState(false)
  const [compareError, setCompareError] = useState('')
  const [researchQuery, setResearchQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState([])
  const [answerError, setAnswerError] = useState('')
  const [answerBusy, setAnswerBusy] = useState(false)
  const [answerMode, setAnswerMode] = useState('research')
  const [health, setHealth] = useState(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    fetch(API + '/health').then((response) => response.ok ? response.json() : null).then(setHealth).catch(() => setHealth(null))
  }, [])

  const runSearch = useCallback(async (value = query) => {
    const term = value.trim()
    if (!term) return
    setSearchBusy(true); setSearchError(''); setTab('search')
    try {
      const response = await apiPost('/search', { query: term, limit: 12 })
      const data = await response.json()
      setResults(data.results || []); setSearchMeta(data)
      if (!researchQuery.trim()) setResearchQuery(term)
    } catch (error) { setSearchError(getError(error)); setResults([]); setSearchMeta(null) }
    finally { setSearchBusy(false) }
  }, [query, researchQuery])

  const runCompare = useCallback(async (nextCode = code) => {
    const text = nextCode.trim()
    if (!text) return
    setCompareBusy(true); setCompareError(''); setTab('compare')
    try {
      const response = await apiPost('/compare', { query: text, limit: 12 })
      const data = await response.json()
      setCompareResults(data.results || []); setCompareMeta(data)
    } catch (error) { setCompareError(getError(error)); setCompareResults([]); setCompareMeta(null) }
    finally { setCompareBusy(false) }
  }, [code])

  const runAI = async (mode, prompt, context) => {
    if (!prompt.trim()) return
    setAnswerMode(mode); setAnswer(''); setSources([]); setAnswerError(''); setAnswerBusy(true)
    try {
      const response = await apiPost(mode === 'judge' ? '/judge' : '/generate', { prompt, context, mode })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        pending += decoder.decode(chunk.value, { stream: true })
        const events = pending.split('\n\n')
        pending = events.pop() || ''
        for (const eventBlock of events) {
          const eventName = (eventBlock.match(/^event: (.+)$/m) || [])[1] || 'message'
          const dataLine = (eventBlock.match(/^data: (.+)$/m) || [])[1]
          if (!dataLine) continue
          const payload = JSON.parse(dataLine)
          if (eventName === 'sources') setSources(payload.sources || [])
          else if (eventName === 'error') setAnswerError(payload.message || 'Gemini could not complete the request.')
          else if (payload.text) setAnswer((current) => current + payload.text)
        }
      }
    } catch (error) { setAnswerError(getError(error)) }
    finally { setAnswerBusy(false) }
  }

  const research = async (term = researchQuery) => {
    const prompt = term.trim()
    if (!prompt) return
    setResearchQuery(prompt); setAnswerMode('research'); setAnswer(''); setSources([]); setAnswerError(''); setAnswerBusy(true)
    let local = results
    if (!local.length || prompt !== query.trim()) {
      try {
        const response = await apiPost('/search', { query: prompt, limit: 8 })
        const data = await response.json()
        local = data.results || []
        setResults(local); setSearchMeta(data)
      } catch (error) { setAnswerError(getError(error)); setAnswerBusy(false); return }
    }
    await runAI('research', prompt, local)
  }

  const judge = async () => {
    let context = compareResults
    if (!context.length) {
      try {
        const response = await apiPost('/compare', { query: code, limit: 10 })
        const data = await response.json()
        context = data.results || []; setCompareResults(context); setCompareMeta(data)
      } catch (error) { setAnswerMode('judge'); setAnswerError(getError(error)); return }
    }
    await runAI('judge', 'Review this VB.NET code against the supplied R-Instat style guide and closest local examples. Compare patterns and workflow. Return findings by severity (BLOCKER, MAJOR, MINOR, SUGGESTION), cite exact line numbers from my code where possible, explain the local precedent, and propose a corrected alternative. If local evidence is inconclusive, say so.\n\nMY CODE:\n' + code, context)
  }

  const selectExample = (result) => {
    setCode(result.text || ''); setTab('compare'); setCompareResults([result]); setCompareMeta(null)
  }

  const startNewDialog = () => {
    setCode(DIALOG_TEMPLATE); setFileName('dlgNewDialog.vb'); setCompareResults([]); setCompareMeta(null); setTab('compare')
  }

  const downloadCode = () => {
    const safeName = (fileName.trim() || 'dlgNewDialog.vb').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    const finalName = safeName.toLowerCase().endsWith('.vb') ? safeName : safeName + '.vb'
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = finalName; link.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const keyHandler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setTab('search'); searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
  }, [])

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Braces size={21} strokeWidth={1.7} /></div><div><div className="brand-title">R-INSTAT</div><div className="brand-subtitle">KNOWLEGDE</div></div></div>
      <div className="side-rule" />
      <div className="nav-caption">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={'nav-item ' + (tab === 'search' ? 'active' : '')} onClick={() => setTab('search')}><Search size={17} /><span>Search</span>{tab === 'search' && <ChevronRight className="nav-chevron" size={15} />}</button>
        <button className={'nav-item ' + (tab === 'compare' ? 'active' : '')} onClick={() => setTab('compare')}><Code2 size={17} /><span>Compare</span>{tab === 'compare' && <ChevronRight className="nav-chevron" size={15} />}</button>
        <button className={'nav-item ' + (tab === 'research' ? 'active' : '')} onClick={() => setTab('research')}><FlaskConical size={17} /><span>Research</span>{tab === 'research' && <ChevronRight className="nav-chevron" size={15} />}</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="side-rule" />
        <div className="connection-row"><span className="status-led local" /><span>Local memory</span><span className="connection-value">{health?.memory === 'ready' ? 'READY' : '—'}</span></div>
        <div className="connection-row"><span className={'status-led ' + (health?.gemini_configured ? 'online' : 'offline')} /><span>Gemini</span><span className="connection-value">{health?.gemini_configured ? 'READY' : 'OFF'}</span></div>
        <div className="privacy-note"><ShieldCheck size={13} /><span>Gemini runs only when you ask.</span></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="crumb"><span>R-instat Knowlegde</span><span className="crumb-slash">/</span><span className="crumb-current">{tab}</span></div><div className="topbar-right"><span className="local-badge"><HardDrive size={13} /> LOCAL PROJECT</span><div className="avatar">RK</div></div></header>
      <div className="page-content">
        {tab === 'search' && <section className="page-view search-view">
          <div className="page-heading"><div><div className="eyebrow">R-INSTAT REPOSITORY</div><h1>Find a pattern.</h1><p>Search the local codebase, manuals, and dialog examples.</p></div><div className="heading-index">01 <span>/ 03</span></div></div>
          <SearchBox value={query} onChange={setQuery} onSubmit={(event) => { event.preventDefault(); runSearch() }} busy={searchBusy} />
          <div className="search-hint"><span>Try a control, function, or workflow</span><span className="hint-shortcut"><kbd>Ctrl</kbd> <kbd>K</kbd> quick search</span></div>
          {searchError && <div className="inline-error">{searchError}</div>}
          {searchMeta && <div className="result-toolbar"><div><strong>{searchMeta.count}</strong> {searchMeta.count === 1 ? 'result' : 'results'} <span>·</span> {searchMeta.elapsed_ms} ms <span>·</span> local memory</div><button className="subtle-button" onClick={() => setTab('compare')}>Open Compare <ChevronRight size={14} /></button></div>}
          {results.length > 0 ? <ChunkList results={results} onCompare={selectExample} /> : searchMeta && !searchBusy ? <div className="no-results"><div className="no-results-icon"><BookOpen size={20} /></div><div><h3>Nothing in your repo matches “{query}”</h3><p>Try different terms, or ask Gemini to research this as a new task.</p></div><GenerateButton onClick={() => { setResearchQuery(query); setTab('research') }}>Research with Gemini</GenerateButton></div> : !searchMeta && !searchError ? <div className="welcome-grid"><div className="welcome-card"><span className="welcome-number">A</span><div><strong>Search precedents</strong><p>Find dialogs, controls, functions, and their source lines.</p></div></div><div className="welcome-card"><span className="welcome-number">B</span><div><strong>Compare your work</strong><p>See the closest R-Instat examples beside your code.</p></div></div><div className="welcome-card"><span className="welcome-number">C</span><div><strong>Research new work</strong><p>Bring in Gemini only when you choose to ask.</p></div></div></div> : null}
          <div className="page-foot"><span><Database size={13} /> Local index</span><span>{health?.source_files ? health.source_files.toLocaleString() + ' VB files available' : 'Search stays on this computer'}</span></div>
        </section>}

        {tab === 'compare' && <section className="page-view compare-view">
          <div className="page-heading compare-heading"><div><div className="eyebrow">SIDE-BY-SIDE REVIEW</div><h1>Review your code.</h1><p>Your call first. Compare against local patterns, then request an AI review if you want one.</p></div><GenerateButton onClick={judge} disabled={!code.trim()} busy={answerBusy && answerMode === 'judge'}>Judge with AI</GenerateButton></div>
          <div className="compare-grid">
            <section className="compare-panel your-panel"><div className="panel-heading"><div><span className="panel-kicker">01</span><h2>Your code</h2></div><div className="panel-tools"><button className="editor-tool" onClick={startNewDialog} title="Start a style-guide-ordered dialog"><FilePlus2 size={13} />New template</button><input className="file-name-input" value={fileName} onChange={(event) => setFileName(event.target.value)} aria-label="VB file name" /><button className="editor-tool" onClick={downloadCode} disabled={!code.trim()} title="Download the current code"><Download size={13} />Save .vb</button></div></div><div className="code-editor"><div className="line-numbers" aria-hidden="true">{code.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea spellCheck="false" value={code} onChange={(event) => setCode(event.target.value)} aria-label="Your VB.NET code" placeholder="Paste or write your VB.NET code here…" /></div><div className="panel-footer"><span><Circle size={8} /> Editable locally</span><button className="run-compare" onClick={() => runCompare()} disabled={compareBusy || !code.trim()}>{compareBusy ? 'Finding patterns…' : 'Find patterns'}<ChevronRight size={14} /></button></div></section>
            <section className="compare-panel repo-panel"><div className="panel-heading"><div><span className="panel-kicker">02</span><h2>How R-Instat does it</h2></div><span className="local-tag"><Database size={12} /> LOCAL</span></div>
              {compareError && <div className="inline-error in-panel">{compareError}</div>}
              {compareBusy ? <div className="repo-empty"><span className="loading-mark" /><p>Looking for related code in your local repository…</p></div> : compareResults.length ? <div className="repo-results"><div className="pattern-summary"><div className="summary-check"><CheckCircle2 size={15} /></div><div><strong>Closest repository examples</strong><span>{compareMeta?.count || compareResults.length} relevant local matches</span></div></div>{compareResults.slice(0, 5).map((item, index) => <article className="reference-item" key={item.id || item.file + index}><div className="reference-meta"><span>{(item.file || 'Local source').split('/').slice(-1)[0]}{item.line ? ' : ' + item.line : ''}</span><span className="reference-score">{Math.round((item.score || 0) * 100)}%</span></div><div className="reference-kind">{item.kind || 'code'}{item.name ? ' · ' + item.name : ''}</div><pre><code>{item.text}</code></pre><button className="text-action" onClick={() => setCode((current) => current + '\n\n' + item.text)}><Code2 size={13} />Add snippet to your code</button></article>)}</div> : <div className="repo-empty"><div className="empty-glyph"><Code2 size={19} /></div><strong>{compareMeta ? 'No close precedent found' : 'Local examples will appear here'}</strong><p>{compareMeta ? 'You can still judge the code yourself or ask Gemini to review the new pattern.' : 'Paste code and choose Find patterns to search similar dialogs and workflows.'}</p>{compareMeta && <button className="text-action" onClick={() => { setResearchQuery('How should I implement this R-Instat workflow?'); setTab('research') }}>Research this new pattern <ChevronRight size={14} /></button>}</div>}
            </section>
          </div>
          {!answer && !answerError && <div className="review-placeholder"><div className="review-placeholder-icon"><Sparkles size={15} /></div><div><strong>{answerBusy && answerMode === 'judge' ? 'Gemini is reviewing your code…' : 'AI review is optional'}</strong><p>{answerBusy && answerMode === 'judge' ? 'Your findings will stream in here.' : 'Find local patterns first, then choose “Judge with AI” to request findings from Gemini.'}</p></div></div>}
          {answerMode === 'judge' && answer && <AnswerView text={answer} sources={sources} mode="judge" error={answerError} />}
          {answerMode === 'judge' && answerError && <AnswerView text="" sources={[]} mode="judge" error={answerError} />}
          <div className="page-foot"><span><ShieldCheck size={13} />Local examples stay on your computer</span><span>AI review sends your code and selected evidence to Gemini</span></div>
        </section>}

        {tab === 'research' && <section className="page-view research-view">
          <div className="page-heading"><div><div className="eyebrow">NEW ASSIGNMENT</div><h1>Research the unknown.</h1><p>Start with local evidence. Ask Gemini to research only when you choose.</p></div><div className="heading-index">03 <span>/ 03</span></div></div>
          <div className="research-card"><div className="research-orbit"><Sparkles size={21} /></div><div className="eyebrow">GEMINI · WEB RESEARCH</div><h2>{answer || answerError ? 'Research response' : 'Nothing in your repo matches yet?'}</h2><p className="research-intro">{answer || answerError ? 'The answer streams in below. Check sources and verify recommendations before using them.' : 'Describe the new task. We’ll attach the closest local examples, then ask Gemini to research the gap.'}</p>
            <textarea className="research-input" value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="e.g. Add a colour picker to an R-Instat dialog" aria-label="Describe what to research" />
            <GenerateButton onClick={() => research()} disabled={!researchQuery.trim()} busy={answerBusy && answerMode === 'research'}>Research with Gemini</GenerateButton>
            <div className="privacy-callout"><ShieldCheck size={15} /><span>This sends your query and closest repository chunks to Google. No other local files are sent.</span></div>
          </div>
          {(answer || answerError) && <AnswerView text={answer} sources={sources} mode="research" error={answerError} />}
          <div className="page-foot"><span><Wifi size={13} />Web access happens only after you press Research</span><span>{health?.gemini_configured ? 'Gemini configured' : 'Set GEMINI_API_KEY to enable Gemini'}</span></div>
        </section>}
      </div>
    </main>
  </div>
}

export default App
