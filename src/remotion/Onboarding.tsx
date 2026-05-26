import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

const brand = {
  ink: '#071923',
  navy: '#0b2530',
  mint: '#35f2b0',
  mintDark: '#087a65',
  lime: '#d8ff6a',
  coral: '#ff7a59',
  gold: '#f6c85f',
  paper: '#fffdf7',
  cloud: '#eff7ee',
}

const steps = [
  {
    number: '01',
    label: 'Upload',
    title: 'Drop in a statement',
    copy: 'PDFs, receipts, invoices, DOCX, images, CSV, and XLSX.',
  },
  {
    number: '02',
    label: 'Extract',
    title: 'Rows become columns',
    copy: 'Dates, descriptions, withdrawals, deposits, and balances stay separated.',
  },
  {
    number: '03',
    label: 'Review',
    title: 'Check the balance trail',
    copy: 'Use the running balance to spot missing or misread transactions quickly.',
  },
  {
    number: '04',
    label: 'Export',
    title: 'Download clean files',
    copy: 'Excel, CSV, Google Docs-ready DOCX, and PDF summaries.',
  },
]

const rows = [
  ['13/03/2025', 'POS DEBIT', '8.18', '', '3,272.50'],
  ['17/03/2025', 'AUTOPAY CR', '', '8.18', '3,279.33'],
  ['24/03/2025', 'TR IBG', '1,000.00', '', '2,275.58'],
  ['29/03/2025', 'SERVICE FEE', '4.00', '', '2,271.58'],
]

export function ExtractMintOnboarding() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const intro = spring({ frame, fps, config: { damping: 16, stiffness: 110 } })
  const uploadProgress = scene(frame, 70, 140)
  const extractProgress = scene(frame, 140, 230)
  const reviewProgress = scene(frame, 230, 315)
  const exportProgress = scene(frame, 315, 390)
  const ctaProgress = scene(frame, 390, 450)

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(155deg, ${brand.paper} 0%, #eaf8ee 42%, #dff7ef 100%)`,
        color: brand.ink,
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        overflow: 'hidden',
      }}
    >
      <BackgroundEnergy frame={frame} />
      <div style={{ position: 'relative', height: '100%', padding: 58 }}>
        <TopBar />

        <div
          style={{
            marginTop: 54,
            transform: `translateY(${interpolate(intro, [0, 1], [38, 0])}px)`,
            opacity: intro,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 18px',
              borderRadius: 999,
              background: brand.navy,
              color: brand.mint,
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              boxShadow: '0 18px 44px rgba(7,25,35,.2)',
            }}
          >
            Bank statements to Excel
          </div>
          <h1
            style={{
              margin: '26px 0 0',
              maxWidth: 900,
              fontSize: 106,
              lineHeight: 0.9,
              letterSpacing: 0,
            }}
          >
            Convert messy docs into clean working files.
          </h1>
          <p
            style={{
              margin: '28px 0 0',
              maxWidth: 800,
              color: '#49616a',
              fontSize: 35,
              lineHeight: 1.24,
              fontWeight: 620,
            }}
          >
            ExtractMint reads the table, keeps the numbers in place, and gives you
            spreadsheet-ready exports.
          </p>
        </div>

        <HeroDesk
          frame={frame}
          uploadProgress={uploadProgress}
          extractProgress={extractProgress}
          reviewProgress={reviewProgress}
          exportProgress={exportProgress}
        />

        <StepRail activeIndex={activeStep(frame)} frame={frame} />

        <CtaPanel progress={ctaProgress} />
      </div>
    </AbsoluteFill>
  )
}

function TopBar() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <LogoMark size={60} />
        <div style={{ fontSize: 31, fontWeight: 930 }}>ExtractMint</div>
      </div>
      <div
        style={{
          padding: '12px 18px',
          borderRadius: 999,
          background: 'rgba(255,255,255,.72)',
          color: '#4b6169',
          fontSize: 19,
          fontWeight: 800,
          boxShadow: '0 12px 28px rgba(7,25,35,.08)',
        }}
      >
          Works in your browser
      </div>
    </div>
  )
}

function BackgroundEnergy({ frame }: { frame: number }) {
  const drift = interpolate(frame % 180, [0, 90, 180], [0, 34, 0], {
    easing: Easing.inOut(Easing.cubic),
  })

  return (
    <>
      <div
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          borderRadius: 999,
          left: -150 + drift,
          top: 230,
          background: 'rgba(53,242,176,.22)',
          filter: 'blur(18px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: 999,
          right: -130,
          top: 120 + drift * 0.6,
          background: 'rgba(255,122,89,.18)',
          filter: 'blur(22px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 560,
          height: 560,
          borderRadius: 999,
          right: -170,
          bottom: 120 - drift,
          background: 'rgba(216,255,106,.18)',
          filter: 'blur(20px)',
        }}
      />
    </>
  )
}

function HeroDesk({
  frame,
  uploadProgress,
  extractProgress,
  reviewProgress,
  exportProgress,
}: {
  frame: number
  uploadProgress: number
  extractProgress: number
  reviewProgress: number
  exportProgress: number
}) {
  const deskY = interpolate(scene(frame, 34, 90), [0, 1], [32, 0], {
    easing: Easing.out(Easing.cubic),
  })
  const scanX = interpolate((frame - 138) % 90, [0, 90], [-12, 112])
  const tableShift = interpolate(extractProgress, [0, 1], [130, 0], {
    easing: Easing.out(Easing.cubic),
  })

  return (
    <div
      style={{
        position: 'absolute',
        left: 58,
        right: 58,
        top: 700,
        height: 720,
        borderRadius: 42,
        background: brand.navy,
        boxShadow: '0 48px 120px rgba(7,25,35,.32)',
        overflow: 'hidden',
        transform: `translateY(${deskY}px)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(110deg, rgba(53,242,176,.16), transparent 34%, rgba(246,200,95,.15))',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${scanX}%`,
          width: 130,
          background: 'linear-gradient(90deg, transparent, rgba(53,242,176,.36), transparent)',
          opacity: extractProgress > 0.05 ? 1 : 0,
        }}
      />

      <DropCard progress={uploadProgress} />

      <div
        style={{
          position: 'absolute',
          left: 56,
          right: 56,
          bottom: 50,
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 20,
          transform: `translateY(${tableShift}px)`,
          opacity: interpolate(extractProgress, [0, 0.2, 1], [0, 1, 1]),
        }}
      >
        <WorkbookPreview reviewProgress={reviewProgress} />
        <ExportDock progress={exportProgress} />
      </div>
    </div>
  )
}

function DropCard({ progress }: { progress: number }) {
  const lift = interpolate(progress, [0, 1], [0, -26], { easing: Easing.out(Easing.cubic) })
  const fileOpacity = interpolate(progress, [0, 0.35, 1], [0, 1, 1])
  const fill = interpolate(progress, [0, 1], [0, 100])

  return (
    <div
      style={{
        position: 'absolute',
        left: 56,
        right: 56,
        top: 56,
        height: 230,
        borderRadius: 30,
        background: 'rgba(255,253,247,.96)',
        color: brand.ink,
        boxShadow: '0 28px 70px rgba(0,0,0,.28)',
        transform: `translateY(${lift}px)`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 18,
          border: '3px dashed rgba(8,122,101,.24)',
          borderRadius: 22,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 36,
          top: 36,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <div
          style={{
            width: 66,
            height: 66,
            borderRadius: 18,
            display: 'grid',
            placeItems: 'center',
            background: brand.navy,
            color: brand.mint,
          }}
        >
          <UploadIcon />
        </div>
        <div>
          <div style={{ fontSize: 31, fontWeight: 930 }}>Drop documents here</div>
          <div style={{ marginTop: 6, color: '#64767d', fontSize: 21, fontWeight: 650 }}>
            PDF statement, receipt, invoice, or scan
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 36,
          right: 36,
          bottom: 34,
          height: 60,
          borderRadius: 18,
          background: '#eef6ee',
          overflow: 'hidden',
          opacity: fileOpacity,
        }}
      >
        <div
          style={{
            width: `${fill}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${brand.mint}, ${brand.lime})`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px',
            fontSize: 20,
            fontWeight: 850,
          }}
        >
          <span>eStatement20250612.pdf</span>
          <span>{Math.round(fill)}%</span>
        </div>
      </div>
    </div>
  )
}

function WorkbookPreview({ reviewProgress }: { reviewProgress: number }) {
  const highlight = Math.round(interpolate(reviewProgress, [0, 1], [0, rows.length - 1]))

  return (
    <div
      style={{
        borderRadius: 28,
        background: brand.paper,
        color: brand.ink,
        overflow: 'hidden',
        boxShadow: '0 28px 74px rgba(0,0,0,.26)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 28px',
          borderBottom: '1px solid #dfe8de',
        }}
      >
        <div>
          <div
            style={{
              color: brand.mintDark,
              fontSize: 17,
              fontWeight: 930,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Extracted Excel workbook
          </div>
          <div style={{ marginTop: 7, fontSize: 31, fontWeight: 930 }}>
            51 transaction rows detected
          </div>
        </div>
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 999,
            background: '#e8fff4',
            color: brand.mintDark,
            fontSize: 18,
            fontWeight: 930,
          }}
        >
          98% match
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.25fr .95fr .82fr .95fr',
          color: brand.mintDark,
          background: '#eaf7ef',
          fontSize: 17,
          fontWeight: 930,
        }}
      >
        {['Date', 'Description', 'Withdrawal', 'Deposit', 'Balance'].map((header) => (
          <div key={header} style={{ padding: '18px 20px', borderRight: '1px solid #d6e4d7' }}>
            {header}
          </div>
        ))}
      </div>

      {rows.map((row, index) => (
        <div
          key={row.join('-')}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.25fr .95fr .82fr .95fr',
            background: index === highlight ? 'rgba(216,255,106,.34)' : brand.paper,
            transition: 'background .2s linear',
          }}
        >
          {row.map((cell, cellIndex) => (
            <div
              key={`${cell}-${cellIndex}`}
              style={{
                minHeight: 62,
                padding: '18px 20px',
                borderRight: '1px solid #dfe8de',
                borderBottom: '1px solid #dfe8de',
                fontSize: 18,
                fontWeight: cellIndex >= 2 ? 800 : 700,
                textAlign: cellIndex >= 2 ? 'right' : 'left',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function ExportDock({ progress }: { progress: number }) {
  const y = interpolate(progress, [0, 1], [44, 0], { easing: Easing.out(Easing.cubic) })
  const opacity = interpolate(progress, [0, 0.4, 1], [0, 1, 1])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      {['Excel', 'CSV', 'Google Docs', 'PDF'].map((format, index) => (
        <div
          key={format}
          style={{
            display: 'grid',
            placeItems: 'center',
            minHeight: 78,
            borderRadius: 20,
            background: index === 0 ? brand.mint : 'rgba(255,255,255,.12)',
            color: index === 0 ? brand.ink : brand.paper,
            border: `1px solid ${index === 0 ? 'rgba(53,242,176,.6)' : 'rgba(255,255,255,.18)'}`,
            fontSize: 22,
            fontWeight: 930,
            boxShadow: index === 0 ? '0 18px 42px rgba(53,242,176,.28)' : 'none',
          }}
        >
          {format}
        </div>
      ))}
    </div>
  )
}

function StepRail({ activeIndex, frame }: { activeIndex: number; frame: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 58,
        right: 58,
        bottom: 256,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 15,
      }}
    >
      {steps.map((step, index) => {
        const active = index === activeIndex
        const pop = active ? interpolate(frame % 36, [0, 18, 36], [1, 1.035, 1]) : 1
        return (
          <div
            key={step.label}
            style={{
              minHeight: 188,
              padding: 22,
              borderRadius: 26,
              background: active ? brand.paper : 'rgba(255,255,255,.62)',
              border: `2px solid ${active ? brand.mint : 'rgba(7,25,35,.07)'}`,
              boxShadow: active ? '0 22px 54px rgba(7,25,35,.18)' : 'none',
              transform: `scale(${pop})`,
            }}
          >
            <div
              style={{
                color: active ? brand.mintDark : '#7a8c92',
                fontSize: 18,
                fontWeight: 930,
                marginBottom: 10,
              }}
            >
              {step.number}
            </div>
            <div style={{ fontSize: 27, fontWeight: 930, lineHeight: 1 }}>{step.label}</div>
            <div
              style={{
                marginTop: 12,
                color: '#52636a',
                fontSize: 17,
                fontWeight: 650,
                lineHeight: 1.3,
              }}
            >
              {step.copy}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CtaPanel({ progress }: { progress: number }) {
  const y = interpolate(progress, [0, 1], [80, 0], { easing: Easing.out(Easing.cubic) })

  return (
    <div
      style={{
        position: 'absolute',
        left: 58,
        right: 58,
        bottom: 58,
        minHeight: 154,
        borderRadius: 34,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 20,
        padding: '30px 34px',
        background: brand.navy,
        color: brand.paper,
        boxShadow: '0 34px 90px rgba(7,25,35,.26)',
        transform: `translateY(${y}px)`,
        opacity: progress,
      }}
    >
      <div>
        <div style={{ color: brand.mint, fontSize: 20, fontWeight: 930, letterSpacing: 1.2 }}>
          READY TO TRY IT?
        </div>
        <div style={{ marginTop: 7, fontSize: 37, fontWeight: 930 }}>
          Upload a statement. Download clean Excel.
        </div>
      </div>
      <div
        style={{
          padding: '20px 24px',
          borderRadius: 22,
          background: brand.mint,
          color: brand.ink,
          fontSize: 25,
          fontWeight: 930,
        }}
      >
        extractmint.iangoh.com
      </div>
    </div>
  )
}

function LogoMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.24),
        display: 'grid',
        placeItems: 'center',
        background: brand.ink,
        color: '#c9ffe6',
        boxShadow: 'inset 0 0 0 2px rgba(201,255,230,.16), 0 16px 38px rgba(7,25,35,.18)',
      }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 32 32">
        <path
          d="M7.5 5.5h12.25L24.5 10.25v16.25h-17z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M19.5 6v5h5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M11.5 15.25h8.25M11.5 19h5.75" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11.5 22.75h3.25M17.25 22.75h3.25" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M18.25 20.5l2.05 2.05 4.45-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    </div>
  )
}

function UploadIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <path
        d="M17 23V9m0 0-6 6m6-6 6 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 22v3.5A3.5 3.5 0 0 0 11.5 29h11A3.5 3.5 0 0 0 26 25.5V22"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function activeStep(frame: number) {
  if (frame < 140) return 0
  if (frame < 230) return 1
  if (frame < 315) return 2
  return 3
}

function scene(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}
