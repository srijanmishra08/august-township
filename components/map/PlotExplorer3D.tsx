'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Plot3DScene, { type Plot3DSceneHandle } from './Plot3DScene'
import AmenityRoomViewer from './AmenityRoomViewer'
import PanoramaViewer from './PanoramaViewer'
import { matchesFilters, plotLabel, tally } from '@/lib/plots3d'
import type {
  Amenity3D,
  Plot3D,
  Plot3DFacing,
  Plot3DFilters,
  Plot3DStatus,
} from '@/lib/types/plot3d'
import s from './PlotExplorer3D.module.css'

const NO_FILTERS: Plot3DFilters = { status: 'all', size: 'all', facing: 'all' }

const STATUS_OPTIONS: Array<{ value: Plot3DStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'booked', label: 'Booked' },
  { value: 'sold', label: 'Sold' },
]

const BADGE_CLASS: Record<Plot3DStatus, string> = {
  available: s.dbAv,
  booked: s.dbBk,
  sold: s.dbSd,
}

const INDIAN_MOBILE = /^[6-9]\d{9}$/

interface PlotExplorer3DProps {
  plots: Plot3D[]
  amenities: Amenity3D[]
  planImage: string
  planSize: { width: number; pdfWidth: number; pdfHeight: number }
  camera: { position: [number, number, number]; target: [number, number, number] }
  projectSlug: string
  projectName: string
  location?: string
  rera?: string
  whatsappNumber: string
  onBack: () => void
}

type FormPhase = 'idle' | 'open' | 'sending' | 'done'

export default function PlotExplorer3D({
  plots,
  amenities,
  planImage,
  planSize,
  camera,
  projectSlug,
  projectName,
  location,
  rera,
  whatsappNumber,
  onBack,
}: PlotExplorer3DProps) {
  const sceneRef = useRef<Plot3DSceneHandle>(null)

  const [ready, setReady] = useState(false)
  const [filters, setFilters] = useState<Plot3DFilters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [legendOn, setLegendOn] = useState(true)
  const [selected, setSelected] = useState<Plot3D | null>(null)
  const [hover, setHover] = useState<{ plot: Plot3D; x: number; y: number } | null>(null)
  const [toast, setToast] = useState('')
  const [roomAmenity, setRoomAmenity] = useState<Amenity3D | null>(null)

  const [phase, setPhase] = useState<FormPhase>('idle')
  const [confirmedFor, setConfirmedFor] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' })
  const [formError, setFormError] = useState('')

  const wa = whatsappNumber.replace(/\D/g, '')

  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>()
    for (const plot of plots) if (!matchesFilters(plot, filters)) hidden.add(plot.id)
    return hidden
  }, [plots, filters])

  const counts = useMemo(() => tally(plots, filters), [plots, filters])

  const sizeOptions = useMemo(() => {
    const seen: string[] = []
    for (const plot of plots) if (!seen.includes(plot.sizeKey)) seen.push(plot.sizeKey)
    return seen
  }, [plots])

  const facingOptions = useMemo(() => {
    const seen: Plot3DFacing[] = []
    for (const plot of plots) if (!seen.includes(plot.facing)) seen.push(plot.facing)
    return seen
  }, [plots])

  const showToast = useCallback((msg: string) => setToast(msg), [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const closeDetail = useCallback(() => {
    setSelected(null)
    setPhase('idle')
    setFormError('')
  }, [])

  const handleSelect = useCallback(
    (plot: Plot3D | null) => {
      if (!plot) {
        closeDetail()
        return
      }
      if (plot.status === 'sold') {
        showToast('This plot has been sold.')
        return
      }
      setHover(null)
      setSelected(plot)
      setPhase('idle')
      setFormError('')
      setForm({ name: '', phone: '', email: '', message: '' })
    },
    [closeDetail, showToast]
  )

  const handleHover = useCallback((plot: Plot3D | null, x: number, y: number) => {
    setHover(plot ? { plot, x, y } : null)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // The room viewer owns Escape while it is open, otherwise closing it
      // would fall through and exit the explorer entirely.
      if (roomAmenity) return
      if (filterOpen) setFilterOpen(false)
      else if (selected) closeDetail()
      else onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filterOpen, selected, closeDetail, onBack, roomAmenity])

  async function submitInterest() {
    const name = form.name.trim()
    const phone = form.phone.trim()
    if (!name) {
      setFormError('Please enter your name')
      return
    }
    if (!INDIAN_MOBILE.test(phone)) {
      setFormError('Enter a valid 10-digit mobile number')
      return
    }
    setFormError('')
    setPhase('sending')

    // The 3D layout is not mirrored in the plots table yet, so plot_id has no
    // row to reference. Carry the plot in the message instead of losing it.
    const note = form.message.trim()
    const reference = selected
      ? `Interested in ${plotLabel(selected)} (${selected.id}, ${selected.sizeKey} ft, ${selected.sectorName})`
      : null
    const message = [reference, note].filter(Boolean).join('\n\n') || null

    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        email: form.email.trim() || null,
        message,
        project_slug: projectSlug,
        plot_id: null,
      }),
    }).catch(() => null)

    if (!res || !res.ok) {
      const body = await res?.json().catch(() => null)
      setFormError((body as { error?: string } | null)?.error ?? 'Could not submit. Please try again.')
      setPhase('open')
      return
    }

    setConfirmedFor(selected ? plotLabel(selected) : 'this plot')
    setPhase('done')
  }

  const tooltipStyle = useMemo(() => {
    if (!hover) return undefined
    // Flip the card away from the pointer when it would overflow the container.
    const TW = 220
    const TH = 145
    const root = { w: typeof window === 'undefined' ? 0 : window.innerWidth }
    let left = hover.x + 18
    let top = hover.y - TH - 12
    if (left + TW > root.w - 10) left = hover.x - TW - 12
    if (top < 10) top = hover.y + 22
    return { left, top }
  }, [hover])

  return (
    <div className={s.root}>
      <Plot3DScene
        className={s.scene}
        plots={plots}
        amenities={amenities}
        planImage={planImage}
        planSize={planSize}
        camera={camera}
        hiddenIds={hiddenIds}
        selectedId={selected?.id ?? null}
        interactive
        handleRef={sceneRef}
        onHover={handleHover}
        onSelect={handleSelect}
        onAmenitySelect={setRoomAmenity}
        onReady={() => setReady(true)}
      />

      {/* LOADER */}
      <div className={`${s.loader} ${ready ? s.loaderOut : ''}`} aria-hidden={ready}>
        <div className={s.ldBrand}>
          <h1>{projectName.toUpperCase()}</h1>
          <p>{location ?? 'Township'}</p>
        </div>
        <div className={s.ldRing} />
        <div className={s.ldMsg}>{ready ? 'Ready' : 'Preparing experience…'}</div>
      </div>

      {/* COMPASS */}
      <div className={s.compass}>
        <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="26" cy="26" r="23.5" stroke="rgba(255,255,255,0.7)" strokeWidth=".7" />
          <path d="M26 5 L29.5 26 L26 22.5 L22.5 26 Z" fill="white" />
          <path d="M26 47 L29.5 26 L26 29.5 L22.5 26 Z" fill="rgba(255,255,255,0.25)" />
          <text x="26" y="2.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="white">N</text>
          <text x="26" y="52" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="rgba(255,255,255,0.35)">S</text>
          <text x="50" y="27.5" textAnchor="end" fontSize="5.5" fontWeight="700" fill="rgba(255,255,255,0.35)">E</text>
          <text x="2" y="27.5" textAnchor="start" fontSize="5.5" fontWeight="700" fill="rgba(255,255,255,0.35)">W</text>
        </svg>
      </div>

      <button className={s.backBtn} onClick={onBack}>← Back to Tour</button>

      {/* STATS */}
      <div className={s.statsBadge}>
        <div className={s.sbItem}>
          <div className={`${s.sbVal} ${s.sbAv}`}>{counts.available}</div>
          <div className={s.sbLbl}>Available</div>
        </div>
        <div className={s.sbItem}>
          <div className={`${s.sbVal} ${s.sbBk}`}>{counts.booked}</div>
          <div className={s.sbLbl}>Booked</div>
        </div>
        <div className={s.sbItem}>
          <div className={`${s.sbVal} ${s.sbSd}`}>{counts.sold}</div>
          <div className={s.sbLbl}>Sold</div>
        </div>
      </div>

      {/* TOOLTIP */}
      <div className={`${s.tooltip} ${hover ? s.tooltipOn : ''}`} style={tooltipStyle}>
        {hover && (
          <>
            <div className={s.ttEyebrow}>{hover.plot.id}</div>
            <div className={s.ttName}>{hover.plot.sectorName} — {hover.plot.sizeKey} ft</div>
            <div className={s.ttRow}>
              <div className={s.ttItem}>
                <div className={s.ttLbl}>Size</div>
                <div className={s.ttVal}>{hover.plot.sizeKey} ft</div>
              </div>
              <div className={s.ttItem}>
                <div className={s.ttLbl}>Area</div>
                <div className={s.ttVal}>{hover.plot.sqft.toLocaleString('en-IN')} sqft</div>
              </div>
              <div className={s.ttItem}>
                <div className={s.ttLbl}>Facing</div>
                <div className={s.ttVal}>{hover.plot.facing}</div>
              </div>
            </div>
            <div className={s.ttPrice}>
              {hover.plot.status === 'sold' ? (
                <span className={s.ttSold}>SOLD</span>
              ) : (
                <>
                  {hover.plot.priceLabel}
                  <span
                    className={`${s.ttBadge} ${hover.plot.status === 'available' ? s.tbAv : s.tbBk}`}
                  >
                    {hover.plot.status}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* OVERLAY */}
      <div
        className={`${s.overlay} ${selected || filterOpen ? s.overlayDim : ''}`}
        onClick={() => (filterOpen ? setFilterOpen(false) : closeDetail())}
      />

      {/* DETAIL PANEL */}
      <div className={`${s.detail} ${selected ? s.detailOn : ''}`} role="dialog" aria-label="Plot details">
        <div className={s.detDragHandle} />
        {selected && (
          <>
            <div className={s.detHdr}>
              <button className={s.detClose} onClick={closeDetail} aria-label="Close">✕</button>
              <div className={s.detPre}>{selected.sectorName}</div>
              <div className={s.detTitle}>{plotLabel(selected)}</div>
              <div className={s.detSub}>{selected.sizeKey} ft • {selected.facing} Facing</div>
              <span
                className={`${s.detBadge} ${selected.sector === 'L' ? s.dbLux : BADGE_CLASS[selected.status]}`}
              >
                {selected.sector === 'L'
                  ? 'Luxury'
                  : selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
              </span>
            </div>

            <div className={s.detBody}>
              <div className={s.detGrid}>
                <div className={s.detCell}>
                  <div className={s.detCl}>Area (sqft)</div>
                  <div className={s.detCv}>{selected.sqft.toLocaleString('en-IN')}</div>
                </div>
                <div className={s.detCell}>
                  <div className={s.detCl}>Sq. Yards</div>
                  <div className={s.detCv}>{selected.sqyd.toLocaleString('en-IN')}</div>
                </div>
                <div className={s.detCell}>
                  <div className={s.detCl}>Facing</div>
                  <div className={s.detCv}>{selected.facing}</div>
                </div>
                <div className={s.detCell}>
                  <div className={s.detCl}>Block</div>
                  <div className={s.detCv}>{selected.sectorName}</div>
                </div>
              </div>

              <div className={s.detPriceBox}>
                <div className={s.detPl}>Starting Price</div>
                <div className={s.detPv}>₹{selected.price} L</div>
                <div className={s.detPs}>₹{selected.rate.toLocaleString('en-IN')} per sqft</div>
                <div className={s.detEmi}>
                  EMI from ₹{selected.emi.toLocaleString('en-IN')}/mo (20yr @8.5%)
                </div>
              </div>

              {phase === 'done' ? (
                <div className={s.detConfirm}>
                  <div className={s.detConfirmIco}>✓</div>
                  <div className={s.detConfirmMsg}>
                    Your interest in <strong>{confirmedFor}</strong> has been noted.
                    <br />
                    We will reach out to you shortly.
                  </div>
                </div>
              ) : (
                <>
                  <div className={s.detActions}>
                    {phase === 'idle' && (
                      <button
                        className={`${s.detBtn} ${s.detBtnPrimary}`}
                        onClick={() => setPhase('open')}
                      >
                        Express Interest
                      </button>
                    )}
                    {wa && (
                      <a
                        className={`${s.detBtn} ${s.detBtnGhost}`}
                        href={`https://wa.me/${wa}?text=${encodeURIComponent(
                          `Hi, I'd like to schedule a site visit for ${projectName} (${plotLabel(selected)}).`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Schedule Site Visit
                      </a>
                    )}
                  </div>

                  {(phase === 'open' || phase === 'sending') && (
                    <div className={s.detForm}>
                      <div className={s.detFormRule} />
                      <p className={s.detFormLbl}>Your Details</p>
                      <input
                        className={s.detFi}
                        type="text"
                        placeholder="Full Name *"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                      <input
                        className={s.detFi}
                        type="tel"
                        placeholder="Phone Number * (+91)"
                        maxLength={10}
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                      <input
                        className={s.detFi}
                        type="email"
                        placeholder="Email (optional)"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                      <textarea
                        className={s.detFi}
                        placeholder="Message (optional)"
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                      />
                      {formError && <div className={s.detError}>{formError}</div>}
                      <button
                        className={`${s.detBtn} ${s.detBtnPrimary}`}
                        onClick={submitInterest}
                        disabled={phase === 'sending'}
                      >
                        {phase === 'sending' ? 'Submitting…' : 'Submit Interest'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* FILTER PANEL */}
      <div className={`${s.filterPanel} ${filterOpen ? s.filterPanelOn : ''}`} role="dialog" aria-label="Filter plots">
        <button className={s.fpHandle} onClick={() => setFilterOpen(false)} aria-label="Close filters" />
        <div className={s.fpTitle}>Find Your Plot</div>

        <div className={s.fpSec}>
          <div className={s.fpLbl}>Status</div>
          <div className={s.fpPills}>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`${s.fpPill} ${filters.status === opt.value ? s.fpPillOn : ''}`}
                onClick={() => setFilters({ ...filters, status: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.fpSec}>
          <div className={s.fpLbl}>Size (ft)</div>
          <div className={s.fpPills}>
            <button
              className={`${s.fpPill} ${filters.size === 'all' ? s.fpPillOn : ''}`}
              onClick={() => setFilters({ ...filters, size: 'all' })}
            >
              All
            </button>
            {sizeOptions.map((size) => (
              <button
                key={size}
                className={`${s.fpPill} ${filters.size === size ? s.fpPillOn : ''}`}
                onClick={() => setFilters({ ...filters, size })}
              >
                {size.replace('x', '×')}
              </button>
            ))}
          </div>
        </div>

        <div className={s.fpSec}>
          <div className={s.fpLbl}>Facing</div>
          <div className={s.fpPills}>
            <button
              className={`${s.fpPill} ${filters.facing === 'all' ? s.fpPillOn : ''}`}
              onClick={() => setFilters({ ...filters, facing: 'all' })}
            >
              All
            </button>
            {facingOptions.map((facing) => (
              <button
                key={facing}
                className={`${s.fpPill} ${filters.facing === facing ? s.fpPillOn : ''}`}
                onClick={() => setFilters({ ...filters, facing })}
              >
                {facing}
              </button>
            ))}
          </div>
        </div>

        <div className={s.fpSummary}>
          Showing <strong>{counts.shown}</strong> of <strong>{plots.length}</strong> •{' '}
          <span style={{ color: '#E8956D' }}>{counts.available} avail</span> •{' '}
          <span style={{ color: '#D4A820' }}>{counts.booked} booked</span> •{' '}
          <span style={{ color: '#7A7060' }}>{counts.sold} sold</span>
        </div>
        <button className={s.fpReset} onClick={() => setFilters(NO_FILTERS)}>
          Reset all filters
        </button>
      </div>

      {/* LEGEND */}
      {legendOn && (
        <div className={s.legend}>
          <div className={s.lgRow}><div className={`${s.lgDot} ${s.lAv}`} />Available</div>
          <div className={s.lgRow}><div className={`${s.lgDot} ${s.lBk}`} />Booked</div>
          <div className={s.lgRow}><div className={`${s.lgDot} ${s.lSd}`} />Sold</div>
        </div>
      )}

      {/* TOAST */}
      <div className={`${s.toast} ${toast ? s.toastOn : ''}`}>{toast}</div>

      {/* FOOTER NAV */}
      <div className={s.footer}>
        <div className={s.bottomNav}>
          <button className={s.glassPill} onClick={() => setFilterOpen((v) => !v)} aria-label="Filter plots">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span className={s.pillLbl}>Filter</span>
          </button>
          <button className={s.glassPill} onClick={() => sceneRef.current?.resetView()} aria-label="Reset view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className={s.pillLbl}>Reset View</span>
          </button>
          <button className={s.glassPill} onClick={() => setLegendOn((v) => !v)} aria-label="Toggle legend">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className={s.pillLbl}>Legend</span>
          </button>
          {wa && (
            <a
              className={s.glassPill}
              href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I'm interested in ${projectName} plots.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.094.539 4.059 1.48 5.767L.052 23.948 6.32 22.52A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.015-1.374l-.359-.213-3.73.978.995-3.645-.234-.374A9.818 9.818 0 1112 21.818z" />
              </svg>
              <span className={s.pillLbl}>WhatsApp</span>
            </a>
          )}
        </div>
        <div className={s.footerWordmark}>
          {[projectName, location, rera && `RERA: ${rera}`].filter(Boolean).join(' • ')}
        </div>
      </div>

      {/* A real equirectangular panorama wins; the drag-scrub clip is the fallback. */}
      {roomAmenity?.panorama ? (
        <PanoramaViewer
          src={`/data/projects/${projectSlug}/${roomAmenity.panorama}`}
          title={roomAmenity.name}
          description={roomAmenity.description}
          hotspots={roomAmenity.hotspots}
          onHotspot={(target) => {
            const next = amenities.find((a) => a.name === target)
            if (next) setRoomAmenity(next)
          }}
          onClose={() => setRoomAmenity(null)}
        />
      ) : roomAmenity?.video ? (
        <AmenityRoomViewer
          amenity={roomAmenity}
          videoSrc={`/data/projects/${projectSlug}/${roomAmenity.video}`}
          onClose={() => setRoomAmenity(null)}
        />
      ) : null}
    </div>
  )
}
