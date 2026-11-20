import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Download,
  FlipHorizontal2,
  Grid3X3,
  Pause,
  Play,
  Plus,
  Upload,
  UserPlus,
} from 'lucide-react';
import type {
  AnimationState,
  CharacterDefinition,
  ExpressionType,
  Genre,
  SpritesheetConfig,
} from '../types/studio';
import {
  ALL_ANIMATION_STATES,
  ANIMATION_STATE_LABELS,
  buildCharacterVisualSheet,
  STARTER_CHARACTERS,
} from '../data/presets';
import { drawArticulatedCharacter } from '../engines/characterRenderer';
import { drawRetroPixelCharacter } from '../engines/retroPixelRenderer';
import { downloadTextFile } from '../engines/videoExporter';

interface CharacterStudioViewProps {
  characters: CharacterDefinition[];
  onAddCharacter: (char: CharacterDefinition) => void;
  onUpdateCharacter: (char: CharacterDefinition) => void;
}

const EXPRESSIONS: Array<{ value: ExpressionType; label: string }> = [
  { value: 'neutral', label: 'Neutro' },
  { value: 'scared', label: 'Assustado' },
  { value: 'angry', label: 'Furioso' },
  { value: 'happy', label: 'Feliz' },
  { value: 'surprised', label: 'Surpreso' },
  { value: 'determined', label: 'Determinado' },
  { value: 'sad', label: 'Triste' },
  { value: 'sinister_smile', label: 'Sorriso sinistro' },
];

export const CharacterStudioView: React.FC<CharacterStudioViewProps> = ({
  characters,
  onAddCharacter,
  onUpdateCharacter,
}) => {
  const [selectedId, setSelectedId] = useState<string>(characters[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<'preview' | 'spritesheet'>('preview');
  const [animState, setAnimState] = useState<AnimationState>('walk');
  const [expression, setExpression] = useState<ExpressionType>('neutral');
  const [flipX, setFlipX] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [talking, setTalking] = useState(false);

  // Spritesheet Importer & Slicer state
  const [sheetName, setSheetName] = useState('Personagem Spritesheet');
  const [sheetGenre, setSheetGenre] = useState<Genre>('adventure');
  const [sheetDataUrl, setSheetDataUrl] = useState<string>('');
  const [sheetImgDims, setSheetImgDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(4);
  const [fps, setFps] = useState(12);
  const [pivotX, setPivotX] = useState(0.5);
  const [pivotY, setPivotY] = useState(0.95);
  const [frameOrderText, setFrameOrderText] = useState('0,1,2,3,4,5,6,7');
  const [hasTransparency, setHasTransparency] = useState<boolean>(false);
  const [validationNotes, setValidationNotes] = useState<string[]>([]);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const slicerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spritePreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedSheetImgRef = useRef<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selectedChar = characters.find((c) => c.id === selectedId) ?? characters[0];

  // Live articulated / spritesheet character preview animation loop
  useEffect(() => {
    if (activeTab !== 'preview' || !selectedChar) return;
    let raf = 0;
    let t = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (playing) t += dt;

      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          // Studio checkerboard / dark stage grid
          ctx.fillStyle = '#0B0E14';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
          ctx.lineWidth = 1;
          for (let gx = 0; gx < w; gx += 32) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
          }
          for (let gy = 0; gy < h; gy += 32) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
          }
          // Ground reference baseline
          const baseY = h * 0.82;
          ctx.strokeStyle = 'rgba(229, 160, 50, 0.35)';
          ctx.beginPath();
          ctx.moveTo(w * 0.15, baseY);
          ctx.lineTo(w * 0.85, baseY);
          ctx.stroke();

          if (selectedChar.pixelArchetype) {
            const pCanvas = document.createElement('canvas');
            pCanvas.width = 110;
            pCanvas.height = 95;
            const pctx = pCanvas.getContext('2d');
            if (pctx) {
              pctx.imageSmoothingEnabled = false;
              pctx.fillStyle = '#191134';
              pctx.fillRect(0, 0, pCanvas.width, pCanvas.height);
              pctx.fillStyle = '#291e56';
              pctx.fillRect(0, 76, pCanvas.width, 19);
              pctx.fillStyle = '#ff4fa3';
              pctx.fillRect(0, 76, pCanvas.width, 1);
              drawRetroPixelCharacter(
                pctx,
                selectedChar,
                55,
                80,
                1.25,
                talking ? 'talk' : animState,
                expression,
                t,
                flipX
              );
              ctx.save();
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(pCanvas, 0, 0, pCanvas.width, pCanvas.height, 0, 0, w, h);
              ctx.restore();
            }
          } else {
            drawArticulatedCharacter(ctx, selectedChar, {
              x: w * 0.5,
              y: baseY,
              scale: 1.55,
              flipX,
              state: animState,
              expression,
              timeSec: t,
              talking: talking || animState === 'talk',
              rimLightColor: selectedChar.palette.accent,
              rimLightIntensity: 0.4,
              shadowsEnabled: true,
            });
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activeTab, selectedChar, animState, expression, flipX, playing, talking]);

  // Draw spritesheet grid overlay + live sliced loop preview
  useEffect(() => {
    if (activeTab !== 'spritesheet' || !sheetDataUrl || !loadedSheetImgRef.current) return;
    const img = loadedSheetImgRef.current;
    const sc = slicerCanvasRef.current;
    if (sc) {
      const ctx = sc.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, sc.width, sc.height);
        ctx.fillStyle = '#0B0E14';
        ctx.fillRect(0, 0, sc.width, sc.height);

        const fit = Math.min((sc.width - 20) / Math.max(1, img.naturalWidth), (sc.height - 20) / Math.max(1, img.naturalHeight));
        const dw = img.naturalWidth * fit;
        const dh = img.naturalHeight * fit;
        const ox = (sc.width - dw) / 2;
        const oy = (sc.height - dh) / 2;

        ctx.drawImage(img, ox, oy, dw, dh);

        // Draw grid lines
        ctx.strokeStyle = '#E5A032';
        ctx.lineWidth = 1.25;
        const cellW = dw / Math.max(1, cols);
        const cellH = dh / Math.max(1, rows);
        for (let r = 0; r <= rows; r++) {
          ctx.beginPath();
          ctx.moveTo(ox, oy + r * cellH);
          ctx.lineTo(ox + dw, oy + r * cellH);
          ctx.stroke();
        }
        for (let c = 0; c <= cols; c++) {
          ctx.beginPath();
          ctx.moveTo(ox + c * cellW, oy);
          ctx.lineTo(ox + c * cellW, oy + dh);
          ctx.stroke();
        }
        // Frame numbers & pivot crosshair
        ctx.font = '600 11px "JetBrains Mono", monospace';
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const cx = ox + c * cellW;
            const cy = oy + r * cellH;
            ctx.fillStyle = 'rgba(11, 14, 20, 0.78)';
            ctx.fillRect(cx + 2, cy + 2, 20, 15);
            ctx.fillStyle = '#F1F5F9';
            ctx.fillText(String(idx), cx + 6, cy + 13);

            // Pivot mark
            const px = cx + cellW * pivotX;
            const py = cy + cellH * pivotY;
            ctx.strokeStyle = '#38BDF8';
            ctx.beginPath();
            ctx.moveTo(px - 4, py);
            ctx.lineTo(px + 4, py);
            ctx.moveTo(px, py - 4);
            ctx.lineTo(px, py + 4);
            ctx.stroke();
          }
        }
      }
    }

    // Animate sliced frames on preview canvas
    let raf = 0;
    const start = performance.now();
    const order = frameOrderText
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n < rows * cols);
    const seq = order.length > 0 ? order : [0];

    const animLoop = (now: number) => {
      const pc = spritePreviewCanvasRef.current;
      if (pc && img.complete) {
        const ctx = pc.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, pc.width, pc.height);
          ctx.fillStyle = '#0B0E14';
          ctx.fillRect(0, 0, pc.width, pc.height);
          const frameIdx = seq[Math.floor(((now - start) / 1000) * fps) % seq.length] ?? 0;
          const fw = img.naturalWidth / Math.max(1, cols);
          const fh = img.naturalHeight / Math.max(1, rows);
          const c = frameIdx % Math.max(1, cols);
          const r = Math.floor(frameIdx / Math.max(1, cols));
          const scale = Math.min((pc.width - 24) / Math.max(1, fw), (pc.height - 24) / Math.max(1, fh));
          const tw = fw * scale;
          const th = fh * scale;
          ctx.drawImage(img, c * fw, r * fh, fw, fh, (pc.width - tw) / 2, (pc.height - th) / 2, tw, th);
        }
      }
      raf = requestAnimationFrame(animLoop);
    };
    raf = requestAnimationFrame(animLoop);
    return () => cancelAnimationFrame(raf);
  }, [activeTab, sheetDataUrl, rows, cols, fps, pivotX, pivotY, frameOrderText]);

  const validateSheet = (w: number, h: number, r: number, c: number, transparent: boolean) => {
    const notes: string[] = [];
    if (w === 0 || h === 0) {
      notes.push('Nenhuma imagem PNG carregada ainda.');
    } else {
      if (w % c !== 0) {
        notes.push(`A largura (${w}px) não é divisível exatamente por ${c} colunas; ajuste as colunas para evitar desalinhamento.`);
      }
      if (h % r !== 0) {
        notes.push(`A altura (${h}px) não é divisível exatamente por ${r} linhas; ajuste as linhas para recortes limpos.`);
      }
      if (!transparent) {
        notes.push('Fundo opaco detectado: recomenda-se PNG com canal alfa transparente para composição limpa em cenários.');
      }
      if (notes.length === 0) {
        notes.push(`Recorte validado: ${r * c} quadros de ${Math.floor(w / c)}×${Math.floor(h / r)}px com transparência PNG.`);
      }
    }
    setValidationNotes(notes);
  };

  const handleUploadSpritesheet = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        loadedSheetImgRef.current = img;
        setSheetDataUrl(dataUrl);
        setSheetImgDims({ w: img.naturalWidth, h: img.naturalHeight });
        // Inspect real alpha transparency via offscreen canvas
        const probe = document.createElement('canvas');
        probe.width = Math.min(256, img.naturalWidth);
        probe.height = Math.min(256, img.naturalHeight);
        const pctx = probe.getContext('2d');
        let alphaFound = false;
        if (pctx) {
          pctx.drawImage(img, 0, 0, probe.width, probe.height);
          const pixels = pctx.getImageData(0, 0, probe.width, probe.height).data;
          for (let i = 3; i < pixels.length; i += 16) {
            if (pixels[i] < 245) {
              alphaFound = true;
              break;
            }
          }
        }
        setHasTransparency(alphaFound);
        setFrameOrderText(Array.from({ length: rows * cols }, (_, i) => i).join(','));
        validateSheet(img.naturalWidth, img.naturalHeight, rows, cols, alphaFound);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGenerateSampleSpritesheet = () => {
    // Generate a real transparent 4x2 PNG spritesheet from the currently selected articulated character
    if (!selectedChar) return;
    const fw = 128;
    const fh = 160;
    const gCols = 4;
    const gRows = 2;
    const c = document.createElement('canvas');
    c.width = fw * gCols;
    c.height = fh * gRows;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const states: AnimationState[] = ['walk', 'walk', 'walk', 'walk', 'run', 'run', 'attack', 'idle'];
    for (let i = 0; i < gCols * gRows; i++) {
      const col = i % gCols;
      const row = Math.floor(i / gCols);
      ctx.save();
      ctx.beginPath();
      ctx.rect(col * fw, row * fh, fw, fh);
      ctx.clip();
      drawArticulatedCharacter(ctx, selectedChar, {
        x: col * fw + fw * 0.5,
        y: row * fh + fh * 0.9,
        scale: 0.85,
        state: states[i],
        expression: selectedChar.defaultExpression,
        timeSec: i * 0.16,
        shadowsEnabled: false,
      });
      ctx.restore();
    }
    const url = c.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      loadedSheetImgRef.current = img;
      setSheetName(`${selectedChar.name} (Sheet)`);
      setSheetDataUrl(url);
      setSheetImgDims({ w: c.width, h: c.height });
      setRows(gRows);
      setCols(gCols);
      setHasTransparency(true);
      setFrameOrderText('0,1,2,3,4,5,6,7');
      validateSheet(c.width, c.height, gRows, gCols, true);
    };
    img.src = url;
  };

  const handleSaveSpritesheetCharacter = () => {
    if (!sheetDataUrl || sheetImgDims.w === 0) return;
    const order = frameOrderText
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n < rows * cols);
    const frameOrder = order.length > 0 ? order : [0];
    const fw = Math.floor(sheetImgDims.w / Math.max(1, cols));
    const fh = Math.floor(sheetImgDims.h / Math.max(1, rows));

    const spritesheet: SpritesheetConfig = {
      imageDataUrl: sheetDataUrl,
      sheetWidth: sheetImgDims.w,
      sheetHeight: sheetImgDims.h,
      rows,
      cols,
      frameWidth: fw,
      frameHeight: fh,
      totalFrames: rows * cols,
      fps,
      pivotX,
      pivotY,
      frameOrder,
      hasTransparency,
      validated: sheetImgDims.w % cols === 0 && sheetImgDims.h % rows === 0,
      validationNotes,
      clips: {
        idle: { name: 'idle', frames: frameOrder.slice(0, Math.max(1, Math.min(2, frameOrder.length))), fps: Math.max(4, Math.round(fps * 0.5)), loop: true },
        walk: { name: 'walk', frames: frameOrder.slice(0, Math.min(4, frameOrder.length)), fps, loop: true },
        run: { name: 'run', frames: frameOrder, fps: Math.min(30, Math.round(fps * 1.4)), loop: true },
        attack: { name: 'attack', frames: frameOrder.slice(-Math.min(3, frameOrder.length)), fps, loop: false },
      },
    };

    const baseChar: CharacterDefinition = {
      id: `char_sheet_${Date.now().toString(36)}`,
      name: sheetName.trim() || 'Spritesheet Custom',
      role: 'Personagem via Spritesheet PNG',
      genre: sheetGenre,
      description: `Spritesheet PNG ${sheetImgDims.w}×${sheetImgDims.h}px (${rows}×${cols} quadros a ${fps} FPS).`,
      kind: 'spritesheet',
      hairStyle: 'short',
      outfitStyle: 'jacket',
      build: 'average',
      palette: characters[0]?.palette ?? STARTER_CHARACTERS[0].palette,
      accessory: { type: 'none', color: '#E5A032' },
      defaultState: 'walk',
      defaultExpression: 'neutral',
      availableStates: ALL_ANIMATION_STATES,
      spritesheet,
    };
    const newChar: CharacterDefinition = {
      ...baseChar,
      visualSheet: buildCharacterVisualSheet(baseChar),
    };

    onAddCharacter(newChar);
    setSelectedId(newChar.id);
    setActiveTab('preview');
  };

  const handleExportCharacterJson = () => {
    if (!selectedChar) return;
    const safe = selectedChar.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const payload = {
      ...selectedChar,
      spritesheet: selectedChar.spritesheet
        ? { ...selectedChar.spritesheet, imageDataUrl: 'spritesheet.png' }
        : undefined,
    };
    downloadTextFile(JSON.stringify(payload, null, 2), `${safe}_character.json`, 'application/json');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-header */}
      <div className="px-6 py-4 border-b border-[#232C3D] flex flex-wrap items-center justify-between gap-4 bg-[#0F131C]">
        <div>
          <h1 className="text-lg font-semibold text-[#F1F5F9]">Estúdio de Personagens 2D e Spritesheets</h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Rigging anatômico articulado por máquina de estados + importador, cortador e validador real de spritesheets PNG.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-[#121721] border border-[#232C3D] rounded-md">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'preview' ? 'bg-[#E5A032] text-[#0B0E14]' : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Biblioteca e Rig 2D
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('spritesheet')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'spritesheet' ? 'bg-[#E5A032] text-[#0B0E14]' : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            Importar / Cortar Spritesheet PNG
          </button>
        </div>
      </div>

      {activeTab === 'preview' ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Character List */}
          <div className="lg:col-span-3 border-r border-[#232C3D] overflow-y-auto p-4 space-y-2 bg-[#121721]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#94A3B8]">
                Personagens ({characters.length})
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('spritesheet')}
                className="inline-flex items-center gap-1 text-xs text-[#E5A032] hover:text-[#F0B14B]"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo PNG
              </button>
            </div>

            {characters.map((ch) => {
              const active = ch.id === selectedChar?.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(ch.id);
                    setAnimState(ch.defaultState);
                    setExpression(ch.defaultExpression);
                  }}
                  className={`w-full text-left p-3 rounded-md border transition-colors ${
                    active
                      ? 'border-[#E5A032] bg-[#1A2130]'
                      : 'border-[#232C3D] bg-[#0B0E14]/50 hover:bg-[#1A2130]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[#F1F5F9] truncate">{ch.name}</span>
                    <span className="text-[11px] font-mono text-[#94A3B8] shrink-0">
                      {ch.kind === 'spritesheet' ? 'PNG Sheet' : ch.pixelArchetype ? 'Pixel 16-bit' : 'Rig 2D'}
                    </span>
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1 truncate">{ch.role}</div>
                </button>
              );
            })}
          </div>

          {/* Live Stage Viewport */}
          <div className="lg:col-span-5 flex flex-col border-r border-[#232C3D] bg-[#0B0E14] p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#F1F5F9]">{selectedChar?.name}</h2>
                <p className="text-xs text-[#94A3B8]">{selectedChar?.description}</p>
              </div>
              <button
                type="button"
                onClick={handleExportCharacterJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] bg-[#121721] hover:bg-[#1A2130] rounded-md whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                character.json
              </button>
            </div>

            <div className="flex-1 min-h-[340px] flex items-center justify-center border border-[#232C3D] rounded-lg bg-[#0B0E14] overflow-hidden">
              <canvas ref={previewCanvasRef} width={440} height={380} className="max-w-full max-h-full" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded-md"
                >
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {playing ? 'Pausar' : 'Reproduzir'}
                </button>
                <button
                  type="button"
                  onClick={() => setFlipX((f) => !f)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md ${
                    flipX
                      ? 'border-[#E5A032] text-[#E5A032] bg-[#1A2130]'
                      : 'border-[#232C3D] text-[#94A3B8] bg-[#121721]'
                  }`}
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                  Inverter X
                </button>
                <button
                  type="button"
                  onClick={() => setTalking((v) => !v)}
                  className={`px-3 py-1.5 text-xs font-medium border rounded-md ${
                    talking
                      ? 'border-[#E5A032] text-[#E5A032] bg-[#1A2130]'
                      : 'border-[#232C3D] text-[#94A3B8] bg-[#121721]'
                  }`}
                >
                  Lip-sync {talking ? 'ativo' : 'inativo'}
                </button>
              </div>
              <span className="text-xs font-mono text-[#94A3B8]">
                Estado: {ANIMATION_STATE_LABELS[animState]}
              </span>
            </div>
          </div>

          {/* State Machine & Rig Inspector */}
          <div className="lg:col-span-4 overflow-y-auto p-5 bg-[#121721] space-y-6">
            {selectedChar && (
              <>
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-[#F1F5F9]">Máquina de estados (11 animações)</h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_ANIMATION_STATES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setAnimState(st)}
                        className={`px-2.5 py-1.5 text-xs text-left rounded border transition-colors ${
                          animState === st
                            ? 'border-[#E5A032] bg-[#1A2130] text-[#F1F5F9] font-medium'
                            : 'border-[#232C3D] bg-[#0B0E14]/50 text-[#94A3B8] hover:text-[#F1F5F9]'
                        }`}
                      >
                        {ANIMATION_STATE_LABELS[st]}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedChar.kind === 'rig2d' && (
                  <>
                    <div className="space-y-2.5 pt-4 border-t border-[#232C3D]">
                      <h3 className="text-xs font-semibold text-[#F1F5F9]">Expressão facial</h3>
                      <div className="grid grid-cols-3 gap-1.5">
                        {EXPRESSIONS.map((ex) => (
                          <button
                            key={ex.value}
                            type="button"
                            onClick={() => setExpression(ex.value)}
                            className={`px-2 py-1.5 text-xs rounded border transition-colors ${
                              expression === ex.value
                                ? 'border-[#E5A032] bg-[#1A2130] text-[#F1F5F9]'
                                : 'border-[#232C3D] bg-[#0B0E14]/50 text-[#94A3B8]'
                            }`}
                          >
                            {ex.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-[#232C3D]">
                      <h3 className="text-xs font-semibold text-[#F1F5F9]">Personalizar aparência consistente</h3>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <label className="space-y-1">
                          <span className="text-[#94A3B8]">Traje principal</span>
                          <input
                            type="color"
                            value={selectedChar.palette.outfitPrimary}
                            onChange={(e) => {
                              const nextChar: CharacterDefinition = {
                                ...selectedChar,
                                palette: { ...selectedChar.palette, outfitPrimary: e.target.value },
                              };
                              onUpdateCharacter({ ...nextChar, visualSheet: buildCharacterVisualSheet(nextChar) });
                            }}
                            className="w-full h-8 rounded bg-[#0B0E14] border border-[#232C3D] cursor-pointer"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[#94A3B8]">Cor de destaque</span>
                          <input
                            type="color"
                            value={selectedChar.palette.accent}
                            onChange={(e) => {
                              const nextChar: CharacterDefinition = {
                                ...selectedChar,
                                palette: { ...selectedChar.palette, accent: e.target.value },
                              };
                              onUpdateCharacter({ ...nextChar, visualSheet: buildCharacterVisualSheet(nextChar) });
                            }}
                            className="w-full h-8 rounded bg-[#0B0E14] border border-[#232C3D] cursor-pointer"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[#94A3B8]">Cabelo</span>
                          <select
                            value={selectedChar.hairStyle}
                            onChange={(e) => {
                              const nextChar: CharacterDefinition = {
                                ...selectedChar,
                                hairStyle: e.target.value as CharacterDefinition['hairStyle'],
                              };
                              onUpdateCharacter({ ...nextChar, visualSheet: buildCharacterVisualSheet(nextChar) });
                            }}
                            className="w-full rounded border border-[#232C3D] bg-[#1A2130] px-2.5 py-1.5 text-xs text-[#F1F5F9]"
                          >
                            <option value="short">Curto</option>
                            <option value="long">Longo</option>
                            <option value="spiky">Espetado</option>
                            <option value="bob">Bob</option>
                            <option value="hooded">Encapuzado</option>
                            <option value="slick">Penteado para trás</option>
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[#94A3B8]">Acessório</span>
                          <select
                            value={selectedChar.accessory.type}
                            onChange={(e) => {
                              const nextChar: CharacterDefinition = {
                                ...selectedChar,
                                accessory: {
                                  ...selectedChar.accessory,
                                  type: e.target.value as CharacterDefinition['accessory']['type'],
                                },
                              };
                              onUpdateCharacter({ ...nextChar, visualSheet: buildCharacterVisualSheet(nextChar) });
                            }}
                            className="w-full rounded border border-[#232C3D] bg-[#1A2130] px-2.5 py-1.5 text-xs text-[#F1F5F9]"
                          >
                            <option value="flashlight">Lanterna volumétrica</option>
                            <option value="lantern">Lampião</option>
                            <option value="visor">Visor óptico</option>
                            <option value="scarf">Cachecol animado</option>
                            <option value="sword">Espada</option>
                            <option value="shadow_aura">Aura sombria</option>
                            <option value="none">Nenhum</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {selectedChar.kind === 'spritesheet' && selectedChar.spritesheet && (
                  <div className="space-y-2 pt-4 border-t border-[#232C3D] text-xs">
                    <h3 className="font-semibold text-[#F1F5F9]">Metadados da Spritesheet</h3>
                    <div className="grid grid-cols-2 gap-2 font-mono tabular-nums text-[#94A3B8]">
                      <div>Dimensão: {selectedChar.spritesheet.sheetWidth}×{selectedChar.spritesheet.sheetHeight}px</div>
                      <div>Grade: {selectedChar.spritesheet.rows}×{selectedChar.spritesheet.cols}</div>
                      <div>Quadro: {selectedChar.spritesheet.frameWidth}×{selectedChar.spritesheet.frameHeight}px</div>
                      <div>FPS: {selectedChar.spritesheet.fps}</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        /* Spritesheet Importer, Slicer & Validator */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          <div className="lg:col-span-8 p-6 overflow-y-auto space-y-5 bg-[#0B0E14]">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/webp"
              className="hidden"
              onChange={handleUploadSpritesheet}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#F1F5F9]">Cortador e Validador de Spritesheet PNG</h2>
                <p className="text-xs text-[#94A3B8]">
                  Configure manualmente linhas, colunas, pivô e ordem dos quadros para evitar membros desalinhados ou quadros misturados.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateSampleSpritesheet}
                  className="px-3 py-1.5 text-xs font-medium text-[#F1F5F9] border border-[#232C3D] bg-[#121721] hover:bg-[#1A2130] rounded-md whitespace-nowrap"
                >
                  Gerar PNG de teste (4×2)
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] rounded-md whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Carregar PNG
                </button>
              </div>
            </div>

            <div className="border border-[#232C3D] rounded-lg bg-[#121721] p-4 flex items-center justify-center min-h-[340px]">
              {sheetDataUrl ? (
                <canvas ref={slicerCanvasRef} width={680} height={320} className="max-w-full" />
              ) : (
                <div className="text-center space-y-2 max-w-sm">
                  <Grid3X3 className="w-8 h-8 text-[#64748B] mx-auto" />
                  <p className="text-xs text-[#94A3B8]">
                    Envie um arquivo PNG com transparência ou clique em <strong>Gerar PNG de teste (4×2)</strong> para testar o recorte, pivô e validação de quadros.
                  </p>
                </div>
              )}
            </div>

            {/* Validation diagnostics */}
            {validationNotes.length > 0 && (
              <div className="border border-[#232C3D] bg-[#121721] rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold text-[#F1F5F9]">Relatório de validação da spritesheet</div>
                {validationNotes.map((note, idx) => {
                  const isOk = note.startsWith('Recorte validado');
                  return (
                    <div key={idx} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                      {isOk ? (
                        <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                      )}
                      <span>{note}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 border-l border-[#232C3D] bg-[#121721] p-5 overflow-y-auto space-y-5">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#F1F5F9]">Configuração de recorte e metadados</h3>
              <label className="block space-y-1 text-xs">
                <span className="text-[#94A3B8]">Nome do personagem</span>
                <input
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-3 py-1.5 text-xs text-[#F1F5F9]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-[#94A3B8]">Linhas</span>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={rows}
                    onChange={(e) => {
                      const r = Math.max(1, Number(e.target.value));
                      setRows(r);
                      validateSheet(sheetImgDims.w, sheetImgDims.h, r, cols, hasTransparency);
                    }}
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-3 py-1.5 font-mono tabular-nums text-[#F1F5F9]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[#94A3B8]">Colunas</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={cols}
                    onChange={(e) => {
                      const c = Math.max(1, Number(e.target.value));
                      setCols(c);
                      validateSheet(sheetImgDims.w, sheetImgDims.h, rows, c, hasTransparency);
                    }}
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-3 py-1.5 font-mono tabular-nums text-[#F1F5F9]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[#94A3B8]">FPS ({fps})</span>
                  <input
                    type="range"
                    min={4}
                    max={30}
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-full mt-1.5"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[#94A3B8]">Gênero</span>
                  <select
                    value={sheetGenre}
                    onChange={(e) => setSheetGenre(e.target.value as Genre)}
                    className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-2.5 py-1.5 text-xs text-[#F1F5F9]"
                  >
                    <option value="horror">Terror</option>
                    <option value="scifi">Sci-Fi</option>
                    <option value="adventure">Aventura</option>
                    <option value="drama">Drama</option>
                    <option value="educational">Educativo Retrô</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-[#94A3B8]">Pivô X ({pivotX.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={pivotX}
                    onChange={(e) => setPivotX(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[#94A3B8]">Pivô Y ({pivotY.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={pivotY}
                    onChange={(e) => setPivotY(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              </div>

              <label className="block space-y-1 text-xs">
                <span className="text-[#94A3B8]">Ordem dos quadros (índices separados por vírgula)</span>
                <input
                  type="text"
                  value={frameOrderText}
                  onChange={(e) => setFrameOrderText(e.target.value)}
                  className="w-full rounded border border-[#232C3D] bg-[#0B0E14] px-3 py-1.5 font-mono text-xs text-[#F1F5F9]"
                />
              </label>
            </div>

            <div className="space-y-2 pt-3 border-t border-[#232C3D]">
              <div className="text-xs font-medium text-[#94A3B8]">Prévia do loop recortado</div>
              <div className="border border-[#232C3D] rounded bg-[#0B0E14] flex items-center justify-center h-40">
                <canvas ref={spritePreviewCanvasRef} width={180} height={150} />
              </div>
            </div>

            <button
              type="button"
              disabled={!sheetDataUrl}
              onClick={handleSaveSpritesheetCharacter}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#0B0E14] bg-[#E5A032] hover:bg-[#F0B14B] disabled:opacity-40 rounded-md transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Salvar personagem na biblioteca
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
