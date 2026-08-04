'use client'

import { forwardRef, useEffect, useRef } from 'react'
import styles from './Flyover.module.css'

interface AmenityVideoProps {
  src: string
  label: string
  /** True while the camera is settled at this waypoint. */
  playing: boolean
}

/**
 * Floating video panel shown while the camera holds at an amenity.
 *
 * Plays the full-quality encode — this is normal playback, so the all-intra
 * scrub file (which trades bitrate for seekability) would be the wrong source.
 *
 * The panel's opacity is written imperatively by WaypointManager on the
 * forwarded ref, so a fade costs no React renders.
 */
const AmenityVideo = forwardRef<HTMLDivElement, AmenityVideoProps>(
  function AmenityVideo({ src, label, playing }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
      const video = videoRef.current
      if (!video) return

      if (playing) {
        // Autoplay can still be refused (low-power mode, user settings). The
        // clip is decorative, so a rejection is not worth surfacing.
        void video.play().catch(() => {})
      } else {
        video.pause()
        // Rewind so scrolling back replays from the top, not the tail.
        if (video.currentTime > 0.05) video.currentTime = 0
      }
    }, [playing])

    return (
      <div
        ref={ref}
        className={styles.videoPanel}
        style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
      >
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          disableRemotePlayback
        />
        <div className={styles.videoCaption}>{label}</div>
      </div>
    )
  },
)

export default AmenityVideo
