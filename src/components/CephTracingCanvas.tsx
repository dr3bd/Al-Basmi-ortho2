import React from 'react';
import { CephStageRecord, TimepointStage } from '../types/orthodontics';

interface CephTracingCanvasProps {
  records: CephStageRecord[];
  activeStage: TimepointStage;
  showSuperimposition: boolean;
  superimpositionPlane: 'Cranial Base (S-N at S)' | 'Maxillary (ANS-PNS)' | 'Mandibular (Go-Me)';
  onUpdateLandmark?: (code: string, x: number, y: number) => void;
}

export const CephTracingCanvas: React.FC<CephTracingCanvasProps> = ({
  records,
  activeStage,
  showSuperimposition,
  superimpositionPlane,
  onUpdateLandmark,
}) => {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [draggingCode, setDraggingCode] = React.useState<string | null>(null);

  const currentRecord = records.find((r) => r.stage === activeStage) || records[0];
  const t0Record = records.find((r) => r.stage === 'T0_Initial');
  const t1Record = records.find((r) => r.stage === 'T1_Progress');
  const t3Record = records.find((r) => r.stage === 'T3_Final');

  const getCoord = (rec: CephStageRecord | undefined, code: string, fallbackX: number, fallbackY: number) => {
    const found = rec?.landmarks.find((l) => l.code === code);
    return found ? { x: found.x * 4.2, y: found.y * 3.8 } : { x: fallbackX, y: fallbackY };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingCode || !svgRef.current || !onUpdateLandmark) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
    const relY = Math.max(8, Math.min(92, ((e.clientY - rect.top) / rect.height) * 100));
    onUpdateLandmark(draggingCode, Number(relX.toFixed(1)), Number(relY.toFixed(1)));
  };

  const renderTracingLayer = (rec: CephStageRecord | undefined, strokeColor: string, dashArray?: string, labelPrefix?: string) => {
    if (!rec) return null;
    const S = getCoord(rec, 'S', 118, 118);
    const N = getCoord(rec, 'N', 285, 102);
    const A = getCoord(rec, 'A', 290, 205);
    const B = getCoord(rec, 'B', 268, 281);
    const Pog = getCoord(rec, 'Pog', 273, 311);
    const Me = getCoord(rec, 'Me', 256, 326);
    const Go = getCoord(rec, 'Go', 134, 273);
    const U1i = getCoord(rec, 'U1i', 310, 239);
    const L1i = getCoord(rec, 'L1i', 289, 247);

    // Derived soft tissue profile curve based on skeletal/dental coordinates
    const softNoseTip = { x: N.x + 44, y: N.y + 62 };
    const subnasale = { x: A.x + 22, y: A.y - 4 };
    const upperLip = { x: U1i.x + 19, y: U1i.y - 6 };
    const lowerLip = { x: L1i.x + 18, y: L1i.y + 8 };
    const softPog = { x: Pog.x + 21, y: Pog.y };

    return (
      <g key={rec.stage}>
        {/* Cranial Base S-N */}
        <line
          x1={S.x}
          y1={S.y}
          x2={N.x}
          y2={N.y}
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeDasharray={dashArray}
        />
        {/* N-A and N-B Lines */}
        <line
          x1={N.x}
          y1={N.y}
          x2={A.x}
          y2={A.y}
          stroke={strokeColor}
          strokeWidth="1.8"
          strokeDasharray={dashArray}
        />
        <line
          x1={N.x}
          y1={N.y}
          x2={B.x}
          y2={B.y}
          stroke={strokeColor}
          strokeWidth="1.8"
          strokeDasharray={dashArray}
        />
        {/* Mandibular Body Go-Me-Pog-B */}
        <polyline
          points={`${S.x},${S.y} ${Go.x},${Go.y} ${Me.x},${Me.y} ${Pog.x},${Pog.y} ${B.x},${B.y}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeDasharray={dashArray}
        />
        {/* Upper Incisor Axis */}
        <line
          x1={A.x - 10}
          y1={A.y - 12}
          x2={U1i.x}
          y2={U1i.y}
          stroke={strokeColor}
          strokeWidth="2.6"
          strokeDasharray={dashArray}
        />
        {/* Lower Incisor Axis */}
        <line
          x1={B.x - 6}
          y1={B.y + 12}
          x2={L1i.x}
          y2={L1i.y}
          stroke={strokeColor}
          strokeWidth="2.6"
          strokeDasharray={dashArray}
        />
        {/* Soft Tissue Profile */}
        <path
          d={`M ${N.x + 14} ${N.y - 15} Q ${N.x + 16} ${N.y + 8}, ${softNoseTip.x} ${softNoseTip.y} Q ${subnasale.x + 8} ${subnasale.y}, ${subnasale.x} ${subnasale.y} L ${upperLip.x} ${upperLip.y} M ${lowerLip.x} ${lowerLip.y} Q ${B.x + 15} ${B.y}, ${softPog.x} ${softPog.y} Q ${Me.x + 16} ${Me.y + 12}, ${Me.x - 15} ${Me.y + 16}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeDasharray={dashArray}
          opacity="0.9"
        />
        {/* Ricketts E-Line (Nose Tip to Soft Pogonion) */}
        <line
          x1={softNoseTip.x}
          y1={softNoseTip.y}
          x2={softPog.x}
          y2={softPog.y}
          stroke={strokeColor}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.65"
        />
        {labelPrefix && (
          <text x={U1i.x + 26} y={U1i.y} fill={strokeColor} fontSize="10" className="font-mono font-semibold">
            {labelPrefix}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden select-none">
      {/* Top Diagnostic HUD Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <span className="font-mono text-cyan-400 font-semibold">
            {showSuperimposition ? `SUPERIMPOSITION: ${superimpositionPlane}` : `ACTIVE TRACING: ${activeStage}`}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">Drag landmarks to fine-tune doctor calibration</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          {showSuperimposition ? (
            <>
              <span className="flex items-center gap-1.5 text-slate-200">
                <span className="inline-block w-3 h-0.5 bg-slate-300" /> T0 Initial (Black/White)
              </span>
              {t1Record && (
                <span className="flex items-center gap-1.5 text-blue-400">
                  <span className="inline-block w-3 h-0.5 bg-blue-400" /> T1 Progress (Blue)
                </span>
              )}
              {t3Record && (
                <span className="flex items-center gap-1.5 text-rose-400">
                  <span className="inline-block w-3 h-0.5 bg-rose-500" /> T3 Final (Red)
                </span>
              )}
            </>
          ) : (
            <span className="text-emerald-400">● DOCTOR-APPROVED LANDMARKS</span>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 420 380"
        className="w-full h-[360px] cursor-crosshair touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDraggingCode(null)}
        onPointerLeave={() => setDraggingCode(null)}
      >
        {/* Subtle Radiographic Coordinate Grid */}
        <defs>
          <pattern id="cephGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.08)" strokeWidth="0.7" />
          </pattern>
          <radialGradient id="xrayGlow" cx="48%" cy="48%" r="52%">
            <stop offset="0%" stopColor="rgba(30, 41, 59, 0.55)" />
            <stop offset="100%" stopColor="rgba(2, 6, 23, 0.95)" />
          </radialGradient>
        </defs>

        <rect width="420" height="380" fill="url(#xrayGlow)" />
        <rect width="420" height="380" fill="url(#cephGrid)" />

        {/* Cranial Vault Silhouette Background Reference */}
        <path
          d="M 75 160 C 45 90, 95 28, 195 30 C 265 32, 300 62, 286 102"
          fill="none"
          stroke="rgba(148, 163, 184, 0.18)"
          strokeWidth="2"
        />

        {/* Render Superimposition vs Single Stage */}
        {showSuperimposition ? (
          <>
            {renderTracingLayer(t0Record, '#e2e8f0', undefined, 'T0')}
            {renderTracingLayer(t1Record, '#38bdf8', '4 2', 'T1')}
            {renderTracingLayer(t3Record, '#f43f5e', undefined, 'T3')}
          </>
        ) : (
          renderTracingLayer(currentRecord, '#22d3ee')
        )}

        {/* Interactive Landmark Handles for Current Stage */}
        {!showSuperimposition &&
          currentRecord?.landmarks.map((lm) => {
            const cx = lm.x * 4.2;
            const cy = lm.y * 3.8;
            return (
              <g
                key={lm.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingCode(lm.code);
                }}
                className="cursor-grab active:cursor-grabbing"
              >
                <circle cx={cx} cy={cy} r="9" fill="rgba(6, 182, 212, 0.15)" />
                <circle
                  cx={cx}
                  cy={cy}
                  r="4"
                  fill={draggingCode === lm.code ? '#f59e0b' : '#06b6d4'}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
                <text
                  x={cx - 14}
                  y={cy - 7}
                  fill="#f8fafc"
                  fontSize="10"
                  fontWeight="600"
                  className="font-mono pointer-events-none"
                >
                  {lm.code}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
};

export const ClinicalRecordIllustration: React.FC<{
  svgType: string;
  stage: TimepointStage;
  category: string;
}> = ({ svgType, stage, category }) => {
  const isInitial = stage === 'T0_Initial';
  const isProgress = stage === 'T1_Progress';

  return (
    <svg viewBox="0 0 280 180" className="w-full h-40 bg-slate-900 rounded border border-slate-800">
      <defs>
        <linearGradient id={`bg_${svgType}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>
      <rect width="280" height="180" fill={`url(#bg_${svgType})`} />

      {/* Standardized Clinical Grid Lines */}
      <line x1="140" y1="0" x2="140" y2="180" stroke="rgba(56, 189, 248, 0.22)" strokeDasharray="3 3" />
      <line x1="0" y1="90" x2="280" y2="90" stroke="rgba(56, 189, 248, 0.22)" strokeDasharray="3 3" />

      {category.includes('Profile') ? (
        <g>
          {/* Facial Profile Vector Representation */}
          <path
            d={
              isInitial
                ? 'M 115 24 L 118 52 L 154 78 L 138 92 L 158 106 L 156 122 L 130 144 L 105 160'
                : 'M 115 24 L 118 52 L 154 78 L 136 92 L 143 105 L 141 119 L 136 144 L 110 160'
            }
            fill="none"
            stroke={isInitial ? '#f59e0b' : '#10b981'}
            strokeWidth="3"
          />
          {/* E-line */}
          <line
            x1="154"
            y1="78"
            x2={isInitial ? '130' : '136'}
            y2="144"
            stroke="#38bdf8"
            strokeWidth="1.2"
            strokeDasharray="4 2"
          />
          <text x="16" y="30" fill="#94a3b8" fontSize="10" className="font-mono">
            {isInitial ? 'E-Line: +3.5mm (Convex)' : 'E-Line: -1.0mm (Balanced)'}
          </text>
        </g>
      ) : category.includes('Occlusal') ? (
        <g>
          {/* Maxillary Arch Form Representation */}
          <path
            d={
              isInitial
                ? 'M 88 150 Q 140 20, 192 150'
                : 'M 70 150 C 75 40, 205 40, 210 150'
            }
            fill="none"
            stroke={isInitial ? '#f43f5e' : '#10b981'}
            strokeWidth="4"
          />
          {isProgress && (
            <g>
              {/* MARPE Expander Screw */}
              <rect x="122" y="82" width="36" height="22" rx="3" fill="#94a3b8" stroke="#38bdf8" strokeWidth="1.5" />
              <circle cx="128" cy="88" r="2.5" fill="#0284c7" />
              <circle cx="152" cy="88" r="2.5" fill="#0284c7" />
              <circle cx="128" cy="98" r="2.5" fill="#0284c7" />
              <circle cx="152" cy="98" r="2.5" fill="#0284c7" />
            </g>
          )}
          <text x="16" y="28" fill="#94a3b8" fontSize="10" className="font-mono">
            {isInitial ? 'Intermolar Width: 31.5mm' : 'Post-MARPE Width: 37.5mm (+6.0mm)'}
          </text>
        </g>
      ) : (
        <g>
          {/* Intraoral Dental Arch Schematic */}
          {/* Upper Teeth */}
          {[-3, -2, -1, 0, 1, 2, 3].map((idx) => {
            const x = 140 + idx * 20;
            const yOffset = isInitial && (idx === -2 || idx === 2) ? -10 : 0;
            return (
              <rect
                key={`u_${idx}`}
                x={x - 8}
                y={64 + yOffset}
                width="16"
                height="22"
                rx="3"
                fill="#f8fafc"
                stroke="#475569"
                strokeWidth="1.2"
              />
            );
          })}
          {/* Lower Teeth */}
          {[-3, -2, -1, 0, 1, 2, 3].map((idx) => {
            const midlineShift = isInitial ? -6 : 0;
            const x = 140 + idx * 18 + midlineShift;
            return (
              <rect
                key={`l_${idx}`}
                x={x - 7}
                y={90}
                width="14"
                height="20"
                rx="3"
                fill="#e2e8f0"
                stroke="#475569"
                strokeWidth="1.2"
              />
            );
          })}
          {/* Archwire & Brackets in Progress */}
          {isProgress && (
            <>
              <line x1="65" y1="75" x2="215" y2="75" stroke="#38bdf8" strokeWidth="2" />
              <line x1="72" y1="100" x2="208" y2="100" stroke="#38bdf8" strokeWidth="2" />
              <circle cx="75" cy="52" r="4" fill="#f59e0b" />
              <circle cx="205" cy="52" r="4" fill="#f59e0b" />
              <line x1="75" y1="52" x2="105" y2="75" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2 2" />
              <line x1="205" y1="52" x2="175" y2="75" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2 2" />
            </>
          )}
          <text x="16" y="28" fill="#94a3b8" fontSize="10" className="font-mono">
            {isInitial
              ? 'OJ: 7.5mm | Crowding: 6.5mm'
              : isProgress
              ? '0.019x0.025 SS + Bilateral TADs'
              : 'Final Class I | OJ: 2.2mm | OB: 2.0mm'}
          </text>
        </g>
      )}

      <text x="16" y="166" fill="#64748b" fontSize="10" className="font-mono">
        {stage.replace('_', ' ')} · {category}
      </text>
    </svg>
  );
};
