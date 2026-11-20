import JSZip from 'jszip';
import type { ProjectPlan } from '../types/studio';
import { downloadBlob } from './videoExporter';

const REQUIREMENTS_TXT = `PySide6>=6.7.0
numpy>=1.26.0
opencv-python>=4.9.0
Pillow>=10.3.0
scipy>=1.13.0
requests>=2.31.0
pytest>=8.0.0
`;

const INSTALL_BAT = `@echo off
setlocal
echo ======================================================
echo   AI 2D Video Studio - Instalador Windows (Local)
echo ======================================================
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python 3.11+ nao encontrado no PATH.
    echo Instale Python em https://www.python.org/downloads/ marcando "Add Python to PATH".
    pause
    exit /b 1
)

if not exist ".venv" (
    echo Criando ambiente virtual .venv...
    python -m venv .venv
)

call .venv\\Scripts\\activate.bat
echo Atualizando pip e instalando dependencias...
python -m pip install --upgrade pip
pip install -r requirements.txt

echo.
echo Verificando ambiente e FFmpeg...
python original_skill\\scripts\\probe_env.py

echo.
echo Instalacao concluida. Execute start.bat para abrir o AI 2D Video Studio.
pause
`;

const START_BAT = `@echo off
setlocal
if not exist ".venv\\Scripts\\python.exe" (
    echo Ambiente virtual nao encontrado. Execute install.bat primeiro.
    pause
    exit /b 1
)
call .venv\\Scripts\\activate.bat
python app\\main.py
if errorlevel 1 (
    echo.
    echo O aplicativo encerrou com erro. Verifique logs\\studio.log.
    pause
)
`;

const PYINSTALLER_SPEC = `# -*- mode: python ; coding: utf-8 -*-
block_cipher = None

a = Analysis(
    ['app/main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('original_skill', 'original_skill'),
        ('assets', 'assets'),
    ],
    hiddenimports=['PySide6.QtCore', 'PySide6.QtGui', 'PySide6.QtWidgets', 'cv2', 'PIL', 'scipy.io.wavfile'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='AI-2D-Video-Studio',
    debug=False,
    strip=False,
    upx=True,
    console=False,
)
coll = COLLECT(exe, a.binaries, a.zipfiles, a.datas, name='AI-2D-Video-Studio')
`;

const README_MD = `# AI 2D Video Studio (Pacote Desktop Windows)

Estúdio desktop independente em Python + PySide6 + OpenCV + Pillow + SciPy + FFmpeg para geração automática de animações 2D localmente no Windows (otimizado para CPU / AMD Ryzen 3 3200G / Radeon Vega 8 / 16 GB RAM, sem CUDA e sem APIs pagas).

## Requisitos
- Windows 10/11 (64-bit)
- Python 3.11 ou 3.12
- FFmpeg no PATH (para exportação MP4 H.264 + AAC)
- Opcional: Ollama local (\`http://127.0.0.1:11434\`) e Piper / espeak-ng para TTS local

## Instalação e Execução Rápida
1. Execute \`install.bat\` para criar o ambiente virtual e instalar as bibliotecas.
2. Execute \`start.bat\` para abrir a interface desktop PySide6.
3. Para renderizar um plano JSON via linha de comando:
   \`\`\`bash
   python original_skill/scripts/build_video.py --plan projects/projeto_atual_plan.json --output exports/video_final.mp4
   \`\`\`

## Gerar Executável Windows (.exe) com PyInstaller
\`\`\`bash
.venv\\Scripts\\activate.bat
pip install pyinstaller
pyinstaller AI2DVideoStudio.spec
\`\`\`
O executável será gerado em \`dist/AI-2D-Video-Studio/AI-2D-Video-Studio.exe\`.

## Testes Automatizados
\`\`\`bash
.venv\\Scripts\\activate.bat
pytest tests/test_studio.py -v
\`\`\`
`;

const SKILL_COMMON_PY = `"""Utilitarios compartilhados do motor AI 2D Video Studio."""
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict

BASE_DIR = Path(__file__).resolve().parents[2]
LOGS_DIR = BASE_DIR / "logs"
CACHE_DIR = BASE_DIR / "cache"
EXPORTS_DIR = BASE_DIR / "exports"
PROJECTS_DIR = BASE_DIR / "projects"

for d in (LOGS_DIR, CACHE_DIR, EXPORTS_DIR, PROJECTS_DIR):
    d.mkdir(parents=True, exist_ok=True)


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        fh = logging.FileHandler(LOGS_DIR / "studio.log", encoding="utf-8")
        fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    return logger


def load_json(path: str | Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str | Path, data: Dict[str, Any]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def resolve_dimensions(aspect: str, preset: str) -> tuple[int, int]:
    short_map = {"480p": 480, "540p": 540, "720p": 720, "1080p": 1080}
    s = short_map.get(preset, 540)
    if aspect == "9:16":
        return s, int(round((s * 16 / 9) / 2) * 2)
    if aspect == "16:9":
        return int(round((s * 16 / 9) / 2) * 2), s
    return s, s
`;

const SKILL_PROBE_ENV_PY = `"""Diagnostico real do ambiente local (Python, FFmpeg, bibliotecas, RAM, Ollama, TTS)."""
import importlib
import json
import platform
import shutil
import subprocess
import sys
import urllib.request


def check_bin(name: str, arg: str = "--version") -> dict:
    path = shutil.which(name)
    if not path:
        return {"available": False, "path": None, "version": None}
    try:
        out = subprocess.check_output([path, arg], stderr=subprocess.STDOUT, timeout=3, text=True)
        return {"available": True, "path": path, "version": out.splitlines()[0][:100]}
    except Exception as exc:
        return {"available": True, "path": path, "version": str(exc)}


def check_ollama(url: str = "http://127.0.0.1:11434") -> dict:
    try:
        with urllib.request.urlopen(f"{url.rstrip('/')}/api/tags", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name") for m in data.get("models", []) if m.get("name")]
            return {"available": True, "models": models}
    except Exception as exc:
        return {"available": False, "models": [], "error": str(exc)}


def probe_environment() -> dict:
    libs = {}
    for mod in ("PySide6", "numpy", "cv2", "PIL", "scipy"):
        try:
            importlib.import_module(mod)
            libs[mod] = True
        except Exception:
            libs[mod] = False

    return {
        "python": sys.version.split()[0],
        "platform": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "ffmpeg": check_bin("ffmpeg", "-version"),
        "piper": check_bin("piper", "--version"),
        "espeak": check_bin("espeak-ng", "--version"),
        "libraries": libs,
        "ollama": check_ollama(),
    }


if __name__ == "__main__":
    print(json.dumps(probe_environment(), ensure_ascii=False, indent=2))
`;

const SKILL_VALIDATE_PLAN_PY = `"""Validador estrutural do Contrato Canonico JSON v1.0 compartilhado entre Web e Desktop."""
import sys
from pathlib import Path
from typing import List, Dict, Any

from _common import load_json

EXPECTED_SCHEMA_VERSION = "1.0.0"


def validate_plan(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    if plan.get("schemaVersion") != EXPECTED_SCHEMA_VERSION:
        issues.append({
            "severity": "warning",
            "code": "SCHEMA_VERSION_MISMATCH",
            "message": f"Versao de contrato esperada '{EXPECTED_SCHEMA_VERSION}', recebida '{plan.get('schemaVersion')}'.",
        })
    if not str(plan.get("title", "")).strip():
        issues.append({"severity": "error", "code": "EMPTY_TITLE", "message": "Titulo ausente."})
    scenes = plan.get("scenes", [])
    if not scenes:
        issues.append({"severity": "error", "code": "NO_SCENES", "message": "Nenhuma cena definida."})
        return issues

    fmt = plan.get("format", {})
    if fmt.get("aspectRatio") not in ("9:16", "16:9", "1:1"):
        issues.append({"severity": "error", "code": "INVALID_ASPECT", "message": f"Proporcao invalida: {fmt.get('aspectRatio')}"})

    script = plan.get("script", [])
    if len(script) != len(scenes):
        issues.append({"severity": "error", "code": "SCRIPT_LENGTH_MISMATCH", "message": "Descompasso entre roteiro e quantidade de cenas."})

    for ch in plan.get("characterBible", []):
        sheet = ch.get("visualSheet")
        if not sheet:
            issues.append({"severity": "warning", "code": "MISSING_VISUAL_SHEET", "message": f"Personagem {ch.get('name')} sem ficha visual persistente."})

    for idx, sc in enumerate(scenes):
        dur = float(sc.get("duration", 0))
        if dur < 1.0:
            issues.append({"severity": "warning", "code": "SHORT_SCENE", "scene": idx, "message": f"Cena {idx+1} muito curta ({dur}s)."})
        if not sc.get("actors") and not (sc.get("sceneVisualMode") == "infographic_focus" and sc.get("infographic")):
            issues.append({"severity": "warning", "code": "EMPTY_SCENE", "scene": idx, "message": f"Cena {idx+1} sem personagens."})
        fx = sc.get("effects", {})
        if float(fx.get("glitch", 0)) > 0.08 or float(fx.get("scanlines", 0)) > 0.08:
            issues.append({"severity": "warning", "code": "EXCESSIVE_GLITCH", "scene": idx, "message": f"Cena {idx+1} contem glitch/scanlines artificiais."})
        if float(fx.get("fog", 0)) + float(fx.get("smoke", 0)) > 0.65:
            issues.append({"severity": "warning", "code": "EXCESSIVE_VOLUMETRIC_FX", "scene": idx, "message": f"Cena {idx+1} contem nevoa/fumaca excessivas."})
        if idx > 0:
            prev = scenes[idx - 1]
            if prev.get("cameraMove") == sc.get("cameraMove") and prev.get("framing") == sc.get("framing"):
                issues.append({"severity": "warning", "code": "REPETITIVE_CAMERA", "scene": idx, "message": f"Cena {idx+1} repete camera anterior."})
            if prev.get("scenarioId") != sc.get("scenarioId") and sc.get("transitionIn") == "cut":
                issues.append({"severity": "warning", "code": "ABRUPT_SCENARIO_CUT", "scene": idx, "message": f"Cena {idx+1} muda de cenario com corte seco."})

    if plan.get("visualStyle") == "retro_pixel_educational":
        px = plan.get("pixelConfig") or {}
        pw = int(px.get("logicalWidth", px.get("nativeWidth", 0)))
        ph = int(px.get("logicalHeight", px.get("nativeHeight", 0)))
        sm = px.get("scalingMode", px.get("scaling"))
        if sm != "nearest" or pw < 96 or ph < 96:
            issues.append({"severity": "error", "code": "PIXEL_GRID_INVALID", "message": "Perfil RETRO PIXEL EDUCATIONAL exige grade nativa valida com scalingMode='nearest'."})
        edu = plan.get("educationalContext") or {}
        if not edu.get("verifiedFacts"):
            issues.append({"severity": "error", "code": "EDUCATIONAL_UNVERIFIED_CLAIM", "message": "Conteudo educativo sem fatos verificados no contrato."})

    return issues


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python validate_plan.py <plan.json>")
        sys.exit(1)
    plan = load_json(Path(sys.argv[1]))
    res = validate_plan(plan)
    print(f"Validacao concluida: {len(res)} alerta(s).")
    for item in res:
        print(f" - [{item['severity'].upper()}] {item['message']}")
`;

const SKILL_SYNTH_AUDIO_PY = `"""Sintetizador procedural de musica e 12 SFX em WAV estereo com mixagem, ducking e normalizacao."""
import math
from pathlib import Path
import numpy as np
from scipy.io import wavfile

SAMPLE_RATE = 44100


def _adsr(n: int, attack: float = 0.05, release: float = 0.25) -> np.ndarray:
    env = np.ones(n, dtype=np.float32)
    a = min(n, max(1, int(n * attack)))
    r = min(n, max(1, int(n * release)))
    env[:a] = np.linspace(0.0, 1.0, a, dtype=np.float32)
    env[-r:] = np.linspace(1.0, 0.0, r, dtype=np.float32)
    return env


def synth_sfx(kind: str, sr: int = SAMPLE_RATE) -> np.ndarray:
    durations = {
        "whoosh": 0.65, "impact": 0.55, "boom": 1.4, "riser": 1.8,
        "heartbeat": 1.1, "glitch": 0.5, "pop": 0.22, "boing": 0.5,
        "wind": 2.0, "knock": 0.65, "creak": 1.2, "sting": 1.35,
        "arcade_blip": 0.16, "arcade_zap": 0.34, "arcade_freeze": 0.52,
        "arcade_coin": 0.30, "arcade_powerup": 0.55,
    }
    dur = durations.get(kind, 0.7)
    n = int(sr * dur)
    t = np.linspace(0.0, dur, n, endpoint=False, dtype=np.float32)

    if kind == "boom":
        freq = np.geomspace(110.0, 28.0, n)
        wave = np.sin(2 * np.pi * np.cumsum(freq) / sr) * _adsr(n, 0.02, 0.85)
    elif kind == "riser":
        freq = np.geomspace(90.0, 860.0, n)
        wave = 0.5 * np.sin(2 * np.pi * np.cumsum(freq) / sr) * _adsr(n, 0.7, 0.1)
    elif kind == "heartbeat":
        w1 = np.sin(2 * np.pi * 62.0 * t) * np.exp(-t * 9.0)
        shift = int(sr * 0.28)
        w2 = np.zeros_like(w1)
        if shift < n:
            w2[shift:] = 0.75 * w1[: n - shift]
        wave = w1 + w2
    elif kind == "creak":
        freq = 320.0 + 180.0 * np.sin(2 * np.pi * 2.2 * t)
        wave = 0.45 * np.sign(np.sin(2 * np.pi * np.cumsum(freq) / sr)) * _adsr(n, 0.12, 0.35)
    elif kind == "sting":
        wave = sum(0.22 * np.sin(2 * np.pi * f * t) for f in (233.08, 246.94, 493.88, 698.46)) * _adsr(n, 0.03, 0.8)
    elif kind in ("whoosh", "wind"):
        noise = np.random.uniform(-1.0, 1.0, n).astype(np.float32)
        kernel = np.ones(18, dtype=np.float32) / 18.0
        wave = np.convolve(noise, kernel, mode="same") * _adsr(n, 0.3, 0.45) * 0.7
    elif kind == "knock":
        w1 = np.sin(2 * np.pi * 150.0 * t) * np.exp(-t * 22.0)
        shift = int(sr * 0.24)
        w2 = np.zeros_like(w1)
        if shift < n:
            w2[shift:] = 0.85 * w1[: n - shift]
        wave = w1 + w2
    elif kind == "arcade_blip":
        freq = np.where(t < dur * 0.45, 587.33, 880.0)
        wave = 0.55 * np.sign(np.sin(2 * np.pi * np.cumsum(freq) / sr)) * _adsr(n, 0.04, 0.45)
    elif kind == "arcade_zap":
        freq = np.geomspace(1320.0, 190.0, n)
        wave = 0.6 * np.sign(np.sin(2 * np.pi * np.cumsum(freq) / sr)) * _adsr(n, 0.02, 0.6)
    elif kind == "arcade_freeze":
        notes = np.array([1046.5, 1318.5, 1568.0, 2093.0], dtype=np.float32)
        step = np.clip((t / dur * len(notes)).astype(int), 0, len(notes) - 1)
        freq = notes[step]
        wave = 0.48 * np.sin(2 * np.pi * np.cumsum(freq) / sr) * _adsr(n, 0.03, 0.55)
    elif kind == "arcade_coin":
        freq = np.where(t < 0.085, 987.77, 1318.51)
        wave = 0.58 * np.sign(np.sin(2 * np.pi * np.cumsum(freq) / sr)) * _adsr(n, 0.02, 0.65)
    elif kind == "arcade_powerup":
        notes = np.array([392.0, 493.88, 587.33, 783.99, 987.77, 1174.66], dtype=np.float32)
        step = np.clip((t / dur * len(notes)).astype(int), 0, len(notes) - 1)
        freq = notes[step]
        wave = 0.52 * np.sign(np.sin(2 * np.pi * np.cumsum(freq) / sr)) * _adsr(n, 0.03, 0.4)
    else:
        freq = np.geomspace(240.0, 65.0, n)
        wave = np.sin(2 * np.pi * np.cumsum(freq) / sr) * _adsr(n, 0.03, 0.7)

    return np.clip(wave, -1.0, 1.0).astype(np.float32)


def build_project_audio(plan: dict, out_wav: Path) -> Path:
    total_dur = max(2.0, float(plan.get("totalDuration", 30.0)))
    n_samples = int(SAMPLE_RATE * total_dur)
    t = np.linspace(0.0, total_dur, n_samples, endpoint=False, dtype=np.float32)
    audio_cfg = plan.get("audio", {})
    style = audio_cfg.get("musicStyle", "horror_drone")

    # Procedural music bed (supports retro_chiptune 8/16-bit and cinematic ambient)
    music = np.zeros(n_samples, dtype=np.float32)
    if style == "retro_chiptune":
        step_dur = 0.145
        step_idx = (t / step_dur).astype(int)
        melody = np.array([523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 783.99], dtype=np.float32)
        bass = np.array([130.81, 130.81, 164.81, 196.0, 146.83, 146.83, 174.61, 196.0], dtype=np.float32)
        f_lead = melody[step_idx % len(melody)]
        f_bass = bass[(step_idx // 2) % len(bass)]
        phase_in_step = (t % step_dur) / step_dur
        note_env = np.exp(-phase_in_step * 4.0)
        lead = 0.18 * np.sign(np.sin(2 * np.pi * f_lead * t)) * note_env
        sub = 0.22 * (2.0 / np.pi) * np.arcsin(np.sin(2 * np.pi * f_bass * t))
        music = (lead + sub).astype(np.float32) * float(audio_cfg.get("musicVolume", 0.52))
    elif style != "none":
        music = (
            0.22 * np.sin(2 * np.pi * 55.0 * t)
            + 0.14 * np.sin(2 * np.pi * 82.41 * t + np.sin(0.4 * t))
        ).astype(np.float32) * float(audio_cfg.get("musicVolume", 0.48))

    sfx_bus = np.zeros(n_samples, dtype=np.float32)
    cursor = 0.0
    sfx_vol = float(audio_cfg.get("sfxVolume", 0.85))
    for sc in plan.get("scenes", []):
        for ev in sc.get("sfxEvents", []):
            start_i = int((cursor + float(ev.get("offsetSec", 0))) * SAMPLE_RATE)
            clip = synth_sfx(str(ev.get("sfx", "impact"))) * float(ev.get("volume", 0.8)) * sfx_vol
            end_i = min(n_samples, start_i + len(clip))
            if start_i < n_samples and end_i > start_i:
                sfx_bus[start_i:end_i] += clip[: end_i - start_i]
        cursor += float(sc.get("duration", 5.0))

    # Ducking & stereo normalization
    duck = 1.0 - np.clip(np.abs(sfx_bus) * float(audio_cfg.get("duckingAmount", 0.4)), 0.0, 0.65)
    mix = music * duck + sfx_bus
    if audio_cfg.get("normalize", True):
        peak = float(np.max(np.abs(mix))) or 1.0
        mix = mix * (0.88 / peak)

    stereo = np.stack([mix, mix], axis=1)
    pcm = np.int16(np.clip(stereo, -1.0, 1.0) * 32767)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(str(out_wav), SAMPLE_RATE, pcm)
    return out_wav
`;

const SKILL_CAPTIONS_PY = `"""Gerador de legendas palavra a palavra em ASS e SRT."""
from pathlib import Path


def _fmt_srt(sec: float) -> str:
    ms = int(round(max(0.0, sec) * 1000))
    return f"{ms // 3600000:02d}:{(ms % 3600000) // 60000:02d}:{(ms % 60000) // 1000:02d},{ms % 1000:03d}"


def _fmt_ass(sec: float) -> str:
    cs = int(round(max(0.0, sec) * 100))
    return f"{cs // 360000}:{(cs % 360000) // 6000:02d}:{(cs % 6000) // 100:02d}.{cs % 100:02d}"


def export_captions(plan: dict, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    srt_path = out_dir / "captions.srt"
    ass_path = out_dir / "captions.ass"
    srt_blocks = []
    ass_events = []
    cursor = 0.0
    idx = 1

    for sc in plan.get("scenes", []):
        dur = float(sc.get("duration", 5.0))
        text = str(sc.get("captionText", "")).strip()
        if text:
            start, end = cursor + 0.25, cursor + max(0.8, dur - 0.25)
            srt_blocks.append(f"{idx}\\n{_fmt_srt(start)} --> {_fmt_srt(end)}\\n{text}\\n")
            words = text.split()
            word_cs = max(8, int(((end - start) / max(1, len(words))) * 100))
            karaoke = " ".join(f"{{\\\\kf{word_cs}}}{w}" for w in words)
            ass_events.append(f"Dialogue: 0,{_fmt_ass(start)},{_fmt_ass(end)},Default,,0,0,0,,{karaoke}")
            idx += 1
        cursor += dur

    srt_path.write_text("\\n".join(srt_blocks), encoding="utf-8")
    ass_header = (
        "[Script Info]\\nScriptType: v4.00+\\nPlayResX: 1080\\nPlayResY: 1920\\n\\n"
        "[V4+ Styles]\\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\\n"
        "Style: Default,Arial,58,&H0032A0E5,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,240,1\\n\\n"
        "[Events]\\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\\n"
    )
    ass_path.write_text(ass_header + "\\n".join(ass_events) + "\\n", encoding="utf-8")
    return ass_path, srt_path
`;

const SKILL_RENDER_ENGINE_PY = `"""Motor de composicao 2D por camadas com camera, parallax, iluminacao e render retomavel por blocos."""
import math
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw

from _common import CACHE_DIR, resolve_dimensions


def _hex_to_rgb(hx: str, default=(20, 26, 38)) -> tuple[int, int, int]:
    hx = hx.lstrip("#")
    if len(hx) != 6:
        return default
    return tuple(int(hx[i : i + 2], 16) for i in (0, 2, 4))


def render_scene_frame(scene: dict, progress: float, w: int, h: int, time_sec: float) -> np.ndarray:
    img = Image.new("RGB", (w, h), (11, 14, 20))
    draw = ImageDraw.Draw(img, "RGBA")

    # Background vertical atmosphere
    palette = scene.get("colorPalette", ["#0B0E14", "#1A2234", "#E5A032"])
    top_rgb = _hex_to_rgb(palette[0], (10, 14, 22))
    bot_rgb = _hex_to_rgb(palette[1] if len(palette) > 1 else "#1A2234", (22, 30, 46))
    for y in range(0, h, 4):
        ratio = y / max(1, h)
        r = int(top_rgb[0] + (bot_rgb[0] - top_rgb[0]) * ratio)
        g = int(top_rgb[1] + (bot_rgb[1] - top_rgb[1]) * ratio)
        b = int(top_rgb[2] + (bot_rgb[2] - top_rgb[2]) * ratio)
        draw.rectangle([0, y, w, y + 4], fill=(r, g, b))

    # Ground plane
    floor_y = int(h * 0.75)
    draw.rectangle([0, floor_y, w, h], fill=(18, 16, 18))

    # Parallax shift
    pan_x = (progress - 0.5) * w * 0.12

    # Articulated 2D actor with biomechanical weight bounce + directional cast shadow + locked visualSheet palette
    for actor in scene.get("actors", []):
        x0 = float(actor.get("x", 0.3))
        x1 = float(actor.get("targetX", 0.55))
        ease = 3 * progress * progress - 2 * progress * progress * progress
        ax = int((x0 + (x1 - x0) * ease) * w - pan_x * 0.4)
        ay = int(float(actor.get("y", 0.77)) * h)
        s = float(actor.get("scale", 1.0)) * (h / 720.0)
        phase = time_sec * 5.2
        stride = math.sin(phase) * 16 * s
        hip_bounce = -math.cos(2 * phase - 0.55) * 6 * s

        # Grounded contact + directional cast shadow
        draw.ellipse([ax - 32 * s, ay - 6 * s, ax + 32 * s, ay + 8 * s], fill=(0, 0, 0, 140))
        draw.ellipse([ax - 12 * s, ay - 4 * s, ax + 62 * s, ay + 10 * s], fill=(0, 0, 0, 80))
        # Articulated legs with knee bend
        draw.line([(ax - 6 * s, ay - 66 * s + hip_bounce), (ax - 10 * s + stride, ay)], fill=(25, 30, 42, 255), width=max(2, int(9 * s)))
        draw.line([(ax + 6 * s, ay - 66 * s + hip_bounce), (ax + 10 * s - stride, ay)], fill=(34, 42, 58, 255), width=max(2, int(9 * s)))
        # Coat torso
        draw.polygon(
            [(ax - 18 * s, ay - 115 * s + hip_bounce), (ax + 18 * s, ay - 115 * s + hip_bounce), (ax + 24 * s, ay - 46 * s + hip_bounce), (ax - 24 * s, ay - 46 * s + hip_bounce)],
            fill=(40, 50, 68, 255),
        )
        # Head
        draw.ellipse([ax - 14 * s, ay - 146 * s + hip_bounce, ax + 14 * s, ay - 116 * s + hip_bounce], fill=(224, 179, 148, 255))

    frame_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    return frame_bgr


def render_plan_blocks(plan: dict, mode: str = "final", on_progress=None) -> Path:
    fmt = plan.get("format", {})
    preset = fmt.get("previewResolution", "540p") if mode == "preview" else fmt.get("exportResolution", "1080p")
    w, h = resolve_dimensions(fmt.get("aspectRatio", "9:16"), preset)
    fps = int(fmt.get("fps", 24))
    is_retro_pixel = plan.get("visualStyle") == "retro_pixel_educational"
    retro_fn = None
    if is_retro_pixel:
        from retro_pixel_renderer import render_retro_pixel_frame
        retro_fn = render_retro_pixel_frame

    out_video = CACHE_DIR / f"{plan.get('id', 'project')}_{mode}_raw.mp4"
    writer = cv2.VideoWriter(str(out_video), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

    scenes = plan.get("scenes", [])
    total_frames = sum(max(1, int(float(s.get("duration", 5.0)) * fps)) for s in scenes)
    done = 0
    elapsed_t = 0.0
    prev_last_frame = None

    for sc_idx, sc in enumerate(scenes):
        dur = float(sc.get("duration", 5.0))
        frames = max(1, int(dur * fps))
        trans_frames = min(int(fps * 0.55), max(1, frames // 4))
        for f in range(frames):
            prog = f / max(1, frames - 1)
            if is_retro_pixel and retro_fn is not None:
                frame = retro_fn(plan, sc, prog, w, h, elapsed_t)
            else:
                frame = render_scene_frame(sc, prog, w, h, elapsed_t)
            # Transitions (pixel_wipe for retro pixel art, smooth crossfade for cinematic)
            if prev_last_frame is not None and f < trans_frames and sc.get("transitionIn", "crossfade") != "cut":
                alpha = f / max(1, trans_frames)
                if is_retro_pixel and sc.get("transitionIn") == "pixel_wipe":
                    cut_x = int(w * alpha)
                    blended = prev_last_frame.copy()
                    blended[:, :cut_x] = frame[:, :cut_x]
                    frame = blended
                else:
                    alpha = alpha * alpha * (3 - 2 * alpha)
                    frame = cv2.addWeighted(frame, alpha, prev_last_frame, 1.0 - alpha, 0)
            writer.write(frame)
            if f == frames - 1:
                prev_last_frame = frame.copy()
            done += 1
            elapsed_t += 1.0 / fps
            if on_progress and f % max(1, fps // 2) == 0:
                on_progress(int(done * 100 / max(1, total_frames)), f"Bloco {sc_idx + 1}/{len(scenes)}")

    writer.release()
    return out_video
`;

const SKILL_RETRO_PIXEL_RENDERER_PY = `"""Renderizador 16-bit RETRO PIXEL EDUCATIONAL (grade nativa 180x320, Bayer 4x4, escalonamento NEAREST sem borrao)."""
import math
import cv2
import numpy as np
from PIL import Image, ImageDraw

BAYER_4X4 = np.array(
    [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
    ],
    dtype=np.float32,
) / 16.0


def _hex_rgb(hx: str, default=(33, 20, 61)) -> tuple[int, int, int]:
    hx = str(hx or "").lstrip("#")
    if len(hx) != 6:
        return default
    return tuple(int(hx[i : i + 2], 16) for i in (0, 2, 4))


def _fill_dither_bg(nw: int, nh: int, top_rgb, bot_rgb) -> Image.Image:
    y = np.linspace(0.0, 1.0, nh, dtype=np.float32)[:, None]
    bayer_tile = np.tile(BAYER_4X4, (nh // 4 + 1, nw // 4 + 1))[:nh, :nw]
    t = np.clip(y + (bayer_tile - 0.5) * 0.14, 0.0, 1.0)
    top = np.array(top_rgb, dtype=np.float32)
    bot = np.array(bot_rgb, dtype=np.float32)
    rgb = np.clip(top * (1.0 - t[..., None]) + bot * t[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(rgb, mode="RGB")


def _draw_pixel_mascot(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: float, expr: str, t: float):
    s = max(1, int(round(scale)))
    bob = int(round(math.sin(t * 7.5) * 2))
    py = cy + bob
    # Shadow
    draw.ellipse([cx - 12 * s, cy - 2, cx + 12 * s, cy + 4], fill=(16, 10, 30))
    # Legs
    stride = int(round(math.sin(t * 7.5) * 4))
    draw.rectangle([cx - 6 * s + stride, py - 12 * s, cx - 2 * s + stride, py], fill=(44, 56, 128), outline=(14, 10, 26))
    draw.rectangle([cx + 2 * s - stride, py - 12 * s, cx + 6 * s - stride, py], fill=(44, 56, 128), outline=(14, 10, 26))
    # Body
    draw.rectangle([cx - 10 * s, py - 28 * s, cx + 10 * s, py - 11 * s], fill=(255, 79, 163), outline=(14, 10, 26))
    # Head
    draw.rectangle([cx - 11 * s, py - 46 * s, cx + 11 * s, py - 27 * s], fill=(255, 224, 194), outline=(14, 10, 26))
    # Hair
    draw.rectangle([cx - 12 * s, py - 49 * s, cx + 12 * s, py - 42 * s], fill=(49, 28, 92), outline=(14, 10, 26))
    # Eyes (blinking)
    blink = int(t * 2.5) % 9 == 0
    if blink:
        draw.line([(cx - 6 * s, py - 37 * s), (cx - 2 * s, py - 37 * s)], fill=(14, 10, 26))
        draw.line([(cx + 2 * s, py - 37 * s), (cx + 6 * s, py - 37 * s)], fill=(14, 10, 26))
    else:
        draw.rectangle([cx - 6 * s, py - 39 * s, cx - 3 * s, py - 35 * s], fill=(14, 10, 26))
        draw.rectangle([cx + 3 * s, py - 39 * s, cx + 6 * s, py - 35 * s], fill=(14, 10, 26))
        draw.point((cx - 5 * s, py - 38 * s), fill=(255, 255, 255))
        draw.point((cx + 4 * s, py - 38 * s), fill=(255, 255, 255))
    # Mouth
    if expr in ("surprised", "fear"):
        draw.rectangle([cx - 2 * s, py - 32 * s, cx + 2 * s, py - 29 * s], fill=(190, 38, 82))
    else:
        draw.line([(cx - 3 * s, py - 31 * s), (cx + 3 * s, py - 31 * s)], fill=(140, 32, 66))


def _draw_pixel_infographic(draw: ImageDraw.ImageDraw, info: dict, nw: int, nh: int, progress: float, t: float):
    kind = info.get("kind", "process_diagram")
    cx, cy = nw // 2, int(nh * 0.44)
    # Retro arcade panel frame
    draw.rectangle([10, 34, nw - 10, int(nh * 0.72)], fill=(20, 14, 46), outline=(255, 209, 102))
    if kind == "brain_nerve_freeze":
        # Stylized pixel brain + lightning trigeminal signal
        draw.ellipse([cx - 34, cy - 26, cx + 34, cy + 20], fill=(255, 132, 186), outline=(22, 12, 42))
        pulse = int((math.sin(t * 14.0) + 1.0) * 0.5 * 20)
        draw.line([(cx, cy + 44), (cx - 8, cy + 26), (cx + 6, cy + 12), (cx, cy - 4)], fill=(255, 209 + min(45, pulse), 80), width=2)
    elif kind in ("bloodstream_cells", "bone_marrow_cycle"):
        draw.rectangle([16, cy - 28, nw - 16, cy + 28], fill=(92, 18, 42), outline=(255, 93, 85))
        for k in range(5):
            rx = int(20 + ((k * 34 + t * 42) % max(40, nw - 40)))
            ry = cy + int(math.sin(t * 4 + k) * 10)
            draw.ellipse([rx - 10, ry - 7, rx + 10, ry + 7], fill=(255, 76, 94), outline=(48, 8, 22))
            draw.ellipse([rx - 4, ry - 3, rx + 4, ry + 3], fill=(180, 26, 52))
    else:
        for k in range(3):
            r = 14 + k * 14
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(98, 234, 255))
        ang = t * 2.4
        px = cx + int(math.cos(ang) * 28)
        py = cy + int(math.sin(ang) * 28)
        draw.ellipse([px - 6, py - 6, px + 6, py + 6], fill=(255, 209, 102), outline=(14, 10, 26))

    counter = info.get("liveCounter")
    if isinstance(counter, dict):
        s_val = float(counter.get("startValue", 0))
        e_val = float(counter.get("endValue", 100))
        cur = int(round(s_val + (e_val - s_val) * progress))
        txt = f"{counter.get('prefix', '')}{cur}{counter.get('suffix', '')}"
        draw.rectangle([16, 40, nw - 16, 56], fill=(12, 8, 28), outline=(98, 234, 255))
        draw.text((22, 43), txt[:24], fill=(255, 209, 102))


def render_retro_pixel_frame(plan: dict, scene: dict, progress: float, out_w: int, out_h: int, time_sec: float) -> np.ndarray:
    px = plan.get("pixelConfig") or {}
    nw = int(px.get("logicalWidth", px.get("nativeWidth", 180)))
    nh = int(px.get("logicalHeight", px.get("nativeHeight", 320)))

    palette = scene.get("colorPalette") or ["#21143D", "#151B45", "#FFD166"]
    img = _fill_dither_bg(nw, nh, _hex_rgb(palette[0], (33, 20, 61)), _hex_rgb(palette[1] if len(palette) > 1 else "#151B45", (21, 27, 69)))
    draw = ImageDraw.Draw(img)

    # Pixel stars / arcade grid floor
    floor_y = int(nh * 0.74)
    draw.rectangle([0, floor_y, nw, nh], fill=(32, 24, 72))
    for gx in range(0, nw, 12):
        draw.line([(gx, floor_y), (gx, nh)], fill=(54, 40, 112))
    draw.line([(0, floor_y), (nw, floor_y)], fill=(255, 79, 163))

    if scene.get("infographic"):
        _draw_pixel_infographic(draw, scene["infographic"], nw, nh, progress, time_sec)

    if scene.get("sceneVisualMode") != "infographic_focus":
        for actor in scene.get("actors", []):
            x0 = float(actor.get("x", 0.35))
            x1 = float(actor.get("targetX", 0.55))
            ax = int((x0 + (x1 - x0) * progress) * nw)
            ay = int(float(actor.get("y", 0.80)) * nh)
            _draw_pixel_mascot(draw, ax, ay, float(actor.get("scale", 1.0)), str(actor.get("expression", "happy")), time_sec)

    # Crisp pixel caption strip at bottom safe area
    cap = str(scene.get("captionText", "")).strip()
    if cap and (plan.get("captions") or {}).get("enabled", True):
        draw.rectangle([8, nh - 42, nw - 8, nh - 12], fill=(12, 8, 28), outline=(255, 209, 102))
        draw.text((12, nh - 34), cap[:28], fill=(255, 241, 214))

    # Strict NEAREST-NEIGHBOR integer upscaling to output resolution (ZERO BLUR!)
    upscaled = img.resize((out_w, out_h), resample=Image.NEAREST)
    return cv2.cvtColor(np.array(upscaled), cv2.COLOR_RGB2BGR)
`;

const SKILL_BUILD_VIDEO_PY = `"""Pipeline principal de construcao MP4 (H.264 + AAC + legendas ASS) usando FFmpeg local."""
import argparse
import shutil
import subprocess
from pathlib import Path

from _common import CACHE_DIR, EXPORTS_DIR, get_logger, load_json
from captions import export_captions
from qa_check import run_qa
from render_engine import render_plan_blocks
from synth_audio import build_project_audio
from validate_plan import validate_plan

logger = get_logger("build_video")


def build_video(plan_path: Path, output_path: Path, mode: str = "final") -> Path:
    plan = load_json(plan_path)
    issues = validate_plan(plan)
    errors = [i for i in issues if i["severity"] == "error"]
    if errors:
        raise RuntimeError(f"Plano invalido: {errors[0]['message']}")

    raw_video = render_plan_blocks(plan, mode=mode)
    wav_path = build_project_audio(plan, CACHE_DIR / f"{plan.get('id', 'proj')}_mix.wav")
    ass_path, _ = export_captions(plan, CACHE_DIR / f"{plan.get('id', 'proj')}_subs")

    ffmpeg = shutil.which("ffmpeg")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    profile = plan.get("performanceProfile", "equilibrado")
    threads = "2" if profile == "economico" else ("3" if profile == "equilibrado" else "4")
    preset = "veryfast" if profile == "economico" else ("fast" if profile == "equilibrado" else "medium")
    if ffmpeg:
        cmd = [
            ffmpeg, "-y",
            "-i", str(raw_video),
            "-i", str(wav_path),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", preset, "-threads", threads,
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest",
            str(output_path),
        ]
        subprocess.run(cmd, check=True)
    else:
        raise RuntimeError("FFmpeg nao encontrado no PATH. Instale o FFmpeg para exportacao final MP4 (H.264 + AAC).")

    qa = run_qa(output_path, plan)
    logger.info("QA finalizado: passed=%s", qa["passed"])
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output", default=str(EXPORTS_DIR / "video_final.mp4"))
    parser.add_argument("--mode", choices=["preview", "final"], default="final")
    args = parser.parse_args()
    out = build_video(Path(args.plan), Path(args.output), args.mode)
    print(f"Video exportado em: {out}")
`;

const SKILL_QA_CHECK_PY = `"""Controle de qualidade automatizado e folha de contato com OpenCV."""
from pathlib import Path
import cv2
import numpy as np


def run_qa(video_path: Path, plan: dict) -> dict:
    cap = cv2.VideoCapture(str(video_path))
    black_frames = 0
    duplicate_frames = 0
    flicker_events = 0
    total = 0
    thumbs = []
    prev_small = None
    prev_lum = None
    prev_delta = None

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        total += 1
        small = cv2.resize(frame, (96, 96))
        mean_lum = float(np.mean(small))

        if prev_small is not None:
            diff = float(np.mean(np.abs(small.astype(np.float32) - prev_small.astype(np.float32))))
            if diff < 0.15:
                duplicate_frames += 1

        if prev_lum is not None:
            delta = mean_lum - prev_lum
            if prev_delta is not None and delta * prev_delta < 0 and abs(delta) > 12 and abs(prev_delta) > 12:
                flicker_events += 1
            prev_delta = delta
        prev_lum = mean_lum
        prev_small = small

        if total % 24 == 1:
            if mean_lum < 5.0:
                black_frames += 1
            if len(thumbs) < 6:
                thumbs.append(cv2.resize(frame, (240, 135)))
    cap.release()

    if thumbs:
        sheet = np.hstack(thumbs)
        cv2.imwrite(str(video_path.with_suffix(".contact_sheet.jpg")), sheet)

    return {
        "passed": total > 0 and black_frames == 0 and flicker_events == 0,
        "frames_checked": total,
        "black_frames": black_frames,
        "duplicate_frames": duplicate_frames,
        "flicker_events": flicker_events,
        "scenes": len(plan.get("scenes", [])),
    }
`;

const SKILL_TTS_PY = `"""Adaptador opcional de TTS local (Piper / espeak-ng) com fallback limpo sem narracao."""
import shutil
import subprocess
from pathlib import Path


def synthesize_voice(text: str, out_wav: Path, engine: str = "auto") -> bool:
    if not text.strip():
        return False
    espeak = shutil.which("espeak-ng")
    if engine in ("auto", "espeak") and espeak:
        subprocess.run([espeak, "-v", "pt-br", "-w", str(out_wav), text], check=False)
        return out_wav.exists()
    return False
`;

const SKILL_EXPORT_DOCS_PY = `"""Exportador de roteiro e storyboard em Markdown."""
from pathlib import Path


def export_markdown_docs(plan: dict, out_path: Path) -> Path:
    lines = [f"# {plan.get('title', 'Projeto 2D')}", "", f"**Prompt:** {plan.get('prompt', '')}", ""]
    for idx, sc in enumerate(plan.get("scenes", []), 1):
        lines.append(f"## Cena {idx}: {sc.get('title', '')} ({sc.get('duration', 5)}s)")
        lines.append(f"- Enquadramento: {sc.get('framing')} · Camera: {sc.get('cameraMove')}")
        lines.append(f"- Resumo: {sc.get('summary')}")
        if sc.get("captionText"):
            lines.append(f"- Legenda: {sc.get('captionText')}")
        lines.append("")
    out_path.write_text("\\n".join(lines), encoding="utf-8")
    return out_path
`;

const APP_MAIN_PY = `"""Ponto de entrada do aplicativo desktop AI 2D Video Studio (PySide6)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "original_skill" / "scripts"))

from PySide6.QtWidgets import QApplication
from interface.main_window import StudioMainWindow


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("AI 2D Video Studio")
    win = StudioMainWindow()
    win.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
`;

const INTERFACE_MAIN_WINDOW_PY = `"""Janela principal desktop PySide6 em tema escuro com QThread para renderizacao sem travamento."""
import json
from pathlib import Path
from PySide6.QtCore import QThread, Signal
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from _common import EXPORTS_DIR, PROJECTS_DIR, load_json, save_json
from build_video import build_video
from probe_env import probe_environment


class RenderWorker(QThread):
    progress = Signal(int, str)
    finished_ok = Signal(str)
    failed = Signal(str)

    def __init__(self, plan_path: Path, out_path: Path, mode: str = "final"):
        super().__init__()
        self.plan_path = plan_path
        self.out_path = out_path
        self.mode = mode

    def run(self):
        try:
            self.progress.emit(15, "Validando plano e sintetizando audio...")
            result = build_video(self.plan_path, self.out_path, mode=self.mode)
            self.progress.emit(100, "Concluido!")
            self.finished_ok.emit(str(result))
        except Exception as exc:
            self.failed.emit(str(exc))


class StudioMainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AI 2D Video Studio — Desktop Windows")
        self.resize(1180, 760)
        self.setStyleSheet(
            "QMainWindow, QWidget { background: #0B0E14; color: #F1F5F9; font-family: 'Segoe UI'; }"
            "QTextEdit, QComboBox { background: #121721; border: 1px solid #232C3D; padding: 8px; border-radius: 6px; }"
            "QPushButton { background: #E5A032; color: #0B0E14; font-weight: 600; padding: 8px 16px; border-radius: 6px; }"
            "QPushButton:hover { background: #F0B14B; }"
        )

        self.current_plan_path: Path | None = None
        self.worker: RenderWorker | None = None

        tabs = QTabWidget()
        self.setCentralWidget(tabs)

        # Tab 1: Prompt & Render
        main_tab = QWidget()
        layout = QVBoxLayout(main_tab)
        layout.addWidget(QLabel("Descreva o video que deseja criar ou carregue um plano JSON exportado do estudio:"))

        self.prompt_box = QTextEdit()
        self.prompt_box.setPlaceholderText(
            "Ex.: Crie uma animacao 2D de terror sobre um homem que entra em uma casa abandonada..."
        )
        layout.addWidget(self.prompt_box)

        controls = QHBoxLayout()
        self.style_combo = QComboBox()
        self.style_combo.addItems(["cinematic_2d", "retro_pixel_educational"])
        self.mode_combo = QComboBox()
        self.mode_combo.addItems(["preview", "final"])
        btn_load = QPushButton("Abrir Plano JSON")
        btn_load.clicked.connect(self.open_plan)
        btn_render = QPushButton("Renderizar Video MP4")
        btn_render.clicked.connect(self.start_render)
        controls.addWidget(QLabel("Estilo:"))
        controls.addWidget(self.style_combo)
        controls.addWidget(QLabel("Modo:"))
        controls.addWidget(self.mode_combo)
        controls.addWidget(btn_load)
        controls.addWidget(btn_render)
        layout.addLayout(controls)

        self.progress = QProgressBar()
        self.status_label = QLabel("Pronto para producao local.")
        layout.addWidget(self.progress)
        layout.addWidget(self.status_label)
        tabs.addTab(main_tab, "Producao & Render")

        # Tab 2: Diagnostics
        diag_tab = QWidget()
        d_layout = QVBoxLayout(diag_tab)
        self.diag_text = QTextEdit()
        self.diag_text.setReadOnly(True)
        btn_diag = QPushButton("Executar Diagnostico Local")
        btn_diag.clicked.connect(self.refresh_diag)
        d_layout.addWidget(btn_diag)
        d_layout.addWidget(self.diag_text)
        tabs.addTab(diag_tab, "Diagnostico do Sistema")
        self.refresh_diag()

    def refresh_diag(self):
        self.diag_text.setPlainText(json.dumps(probe_environment(), ensure_ascii=False, indent=2))

    def open_plan(self):
        path, _ = QFileDialog.getOpenFileName(self, "Abrir Plano JSON", str(PROJECTS_DIR), "JSON (*.json)")
        if path:
            self.current_plan_path = Path(path)
            plan = load_json(self.current_plan_path)
            self.prompt_box.setPlainText(plan.get("prompt", ""))
            self.status_label.setText(f"Plano carregado: {plan.get('title', path)}")

    def start_render(self):
        if not self.current_plan_path:
            # Save a starter plan from prompt honoring selected visual style
            fallback = PROJECTS_DIR / "quick_plan.json"
            style = self.style_combo.currentText()
            if style == "retro_pixel_educational":
                save_json(
                    fallback,
                    {
                        "schemaVersion": "1.0.0",
                        "id": "desktop_retro_edu",
                        "title": "Curiosidade Cientifica Retro Pixel",
                        "prompt": self.prompt_box.toPlainText().strip() or "Explique o congelamento cerebral (brain freeze)",
                        "genre": "educational",
                        "visualStyle": "retro_pixel_educational",
                        "pixelConfig": {"logicalWidth": 180, "logicalHeight": 320, "ditherStrength": 0.72, "scalingMode": "nearest", "paletteName": "arcade_90s_neon", "outlinePx": 1},
                        "educationalContext": {
                            "domain": "corpo_humano",
                            "topicId": "topic_brain_freeze",
                            "topicTitle": "Por que o Sorvete Congela o Cerebro?",
                            "factSource": "verified_offline_db",
                            "verifiedFacts": ["O frio no ceu da boca contrai e dilata vasos sanguineos rapidamente.", "O nervo trigemeo envia sinal de alerta para a testa."],
                            "sourceCitation": "Base cientifica offline verificada (BMJ / Harvard Health)",
                        },
                        "totalDuration": 12,
                        "format": {"aspectRatio": "9:16", "previewResolution": "540p", "exportResolution": "1080p", "fps": 24, "renderer": "ffmpeg_mp4"},
                        "audio": {"musicStyle": "retro_chiptune", "musicVolume": 0.5, "sfxVolume": 0.85, "voiceVolume": 0.0, "fadeInSec": 0.5, "fadeOutSec": 0.8, "duckingAmount": 0.35, "normalize": True, "narrationMode": "none"},
                        "captions": {"enabled": True, "preset": "arcade_pixel", "fontSize": 32, "positionY": 0.86, "safeAreaMargin": 0.08, "highlightColor": "#FFD166", "textColor": "#FFF1D6", "outlineWidth": 4, "shadowBlur": 0, "enterAnimation": "pop", "exitAnimation": "fade"},
                        "characterBible": [],
                        "script": [
                            {"sceneIndex": 0, "heading": "CENA 1 — GANCHO", "action": "Mascote toma sorvete gelado.", "dialogue": "Por que o cerebro congela?", "soundCue": "arcade_freeze"},
                            {"sceneIndex": 1, "heading": "CENA 2 — EXPLICACAO", "action": "Infografico do nervo trigemeo.", "dialogue": "O nervo trigemeo dispara um alerta!", "soundCue": "arcade_zap"},
                        ],
                        "scenes": [
                            {
                                "index": 0, "title": "Gancho Gelado", "summary": "Mascote toma sorvete gelado.", "duration": 6, "framing": "medium", "cameraMove": "zoom", "transitionIn": "pixel_wipe",
                                "colorPalette": ["#21143D", "#151B45", "#FFD166"],
                                "effects": {"fog": 0, "smoke": 0, "glitch": 0, "scanlines": 0},
                                "actors": [{"x": 0.35, "y": 0.80, "targetX": 0.52, "scale": 1.0, "expression": "surprised"}],
                                "sfxEvents": [{"sfx": "arcade_freeze", "offsetSec": 0.3, "volume": 0.8}],
                                "captionText": "Por que o cerebro congela?",
                            },
                            {
                                "index": 1, "title": "Alarme do Nervo", "summary": "Infografico do nervo trigemeo.", "duration": 6, "framing": "detail", "cameraMove": "dolly_in", "transitionIn": "pixel_wipe",
                                "sceneVisualMode": "infographic_focus",
                                "infographic": {"kind": "brain_nerve_freeze", "title": "NERVO TRIGEMEO", "stage": 2, "liveCounter": {"label": "RESPOSTA", "startValue": 0, "endValue": 100, "suffix": "%"}},
                                "colorPalette": ["#151B45", "#2B144A", "#FF4FA3"],
                                "effects": {"fog": 0, "smoke": 0, "glitch": 0, "scanlines": 0},
                                "actors": [],
                                "sfxEvents": [{"sfx": "arcade_zap", "offsetSec": 0.4, "volume": 0.85}],
                                "captionText": "O nervo trigemeo dispara o alerta!",
                            },
                        ],
                    },
                )
            else:
                save_json(
                    fallback,
                    {
                        "schemaVersion": "1.0.0",
                        "id": "desktop_quick",
                        "title": "Producao Local 2D",
                        "prompt": self.prompt_box.toPlainText().strip() or "Animacao 2D local",
                        "genre": "horror",
                        "visualStyle": "cinematic_2d",
                        "totalDuration": 12,
                        "format": {"aspectRatio": "9:16", "previewResolution": "540p", "exportResolution": "1080p", "fps": 24, "renderer": "ffmpeg_mp4"},
                        "audio": {"musicStyle": "horror_drone", "musicVolume": 0.45, "sfxVolume": 0.85, "voiceVolume": 0.0, "fadeInSec": 1.0, "fadeOutSec": 1.2, "duckingAmount": 0.4, "normalize": True, "narrationMode": "none"},
                        "captions": {"enabled": False, "preset": "noir_minimal", "fontSize": 34, "positionY": 0.84, "safeAreaMargin": 0.08, "highlightColor": "#E5A032", "textColor": "#F8FAFC", "outlineWidth": 4, "shadowBlur": 10, "enterAnimation": "fade", "exitAnimation": "fade"},
                        "characterBible": [],
                        "script": [
                            {"sceneIndex": 0, "heading": "CENA 1 — ABERTURA", "action": "Protagonista caminha pelo ambiente escuro.", "dialogue": "(Sem narracao)", "soundCue": "Vento (wind)"},
                            {"sceneIndex": 1, "heading": "CENA 2 — CLIMAX", "action": "Revelacao dramatica sob tensao crescente.", "dialogue": "(Sem narracao)", "soundCue": "Sting (sting)"},
                        ],
                        "scenes": [
                            {
                                "index": 0, "title": "Abertura", "summary": "Protagonista caminha pelo ambiente escuro.", "duration": 6, "framing": "wide", "cameraMove": "dolly_in", "transitionIn": "fade_black",
                                "colorPalette": ["#070A12", "#172033", "#E5A032"],
                                "effects": {"fog": 0.16, "smoke": 0.06, "glitch": 0, "scanlines": 0},
                                "actors": [{"x": 0.25, "y": 0.77, "targetX": 0.55, "scale": 1.0}],
                                "sfxEvents": [{"sfx": "wind", "offsetSec": 0.2, "volume": 0.6}],
                                "captionText": "",
                            },
                            {
                                "index": 1, "title": "Climax", "summary": "Revelacao dramatica sob tensao crescente.", "duration": 6, "framing": "close_up", "cameraMove": "dutch_angle", "transitionIn": "crossfade",
                                "colorPalette": ["#0A0D16", "#231926", "#EF4444"],
                                "effects": {"fog": 0.18, "smoke": 0.08, "glitch": 0, "scanlines": 0},
                                "actors": [{"x": 0.55, "y": 0.77, "targetX": 0.42, "scale": 1.15}],
                                "sfxEvents": [{"sfx": "sting", "offsetSec": 0.5, "volume": 0.9}],
                                "captionText": "",
                            },
                        ],
                    },
                )
            self.current_plan_path = fallback

        out = EXPORTS_DIR / f"{self.current_plan_path.stem}_{self.mode_combo.currentText()}.mp4"
        self.worker = RenderWorker(self.current_plan_path, out, self.mode_combo.currentText())
        self.worker.progress.connect(lambda p, msg: (self.progress.setValue(p), self.status_label.setText(msg)))
        self.worker.finished_ok.connect(lambda p: QMessageBox.information(self, "Concluido", f"Video salvo em:\\n{p}"))
        self.worker.failed.connect(lambda err: QMessageBox.critical(self, "Erro de Render", err))
        self.worker.start()
`;

const OLLAMA_ADAPTER_PY = `"""Adaptador opcional para Ollama local (nunca envia dados para servicos externos)."""
import json
import urllib.request


class OllamaAdapter:
    def __init__(self, base_url: str = "http://127.0.0.1:11434"):
        self.base_url = base_url.rstrip("/")

    def list_models(self) -> list[str]:
        try:
            with urllib.request.urlopen(f"{self.base_url}/api/tags", timeout=2) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return [m["name"] for m in data.get("models", []) if "name" in m]
        except Exception:
            return []
`;

const TESTS_STUDIO_PY = `"""Testes automatizados dos modulos principais do AI 2D Video Studio."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "original_skill" / "scripts"))

from validate_plan import validate_plan
from synth_audio import synth_sfx
from captions import export_captions


def test_validate_plan_detects_missing_scenes():
    issues = validate_plan({"title": "Teste", "scenes": []})
    assert any(i["code"] == "NO_SCENES" for i in issues)


def test_synth_sfx_generates_audio_samples():
    samples = synth_sfx("creak")
    assert len(samples) > 1000
    assert float(samples.max()) <= 1.0


def test_export_captions_creates_ass_and_srt(tmp_path):
    plan = {"scenes": [{"duration": 4.0, "captionText": "Passos no andar de cima."}]}
    ass_path, srt_path = export_captions(plan, tmp_path)
    assert ass_path.exists() and srt_path.exists()
    assert "Passos" in srt_path.read_text(encoding="utf-8")


def test_retro_pixel_renderer_outputs_nearest_frame():
    from retro_pixel_renderer import render_retro_pixel_frame
    plan = {
        "visualStyle": "retro_pixel_educational",
        "pixelConfig": {"logicalWidth": 180, "logicalHeight": 320, "scalingMode": "nearest"},
        "captions": {"enabled": True},
    }
    scene = {
        "colorPalette": ["#21143D", "#151B45", "#FFD166"],
        "infographic": {"kind": "brain_nerve_freeze", "title": "BRAIN FREEZE"},
        "actors": [{"x": 0.4, "y": 0.8, "targetX": 0.5, "scale": 1.0, "expression": "surprised"}],
        "captionText": "O nervo trigemeo dispara o alerta!",
    }
    frame = render_retro_pixel_frame(plan, scene, 0.5, 540, 960, 1.2)
    assert frame.shape == (960, 540, 3)
`;

export async function downloadPythonDesktopBundle(activeProject?: ProjectPlan | null): Promise<string> {
  const zip = new JSZip();
  const root = zip.folder('AI-2D-VIDEO-STUDIO');
  if (!root) throw new Error('Falha ao inicializar pacote ZIP.');

  // Root files
  root.file('requirements.txt', REQUIREMENTS_TXT);
  root.file('install.bat', INSTALL_BAT);
  root.file('start.bat', START_BAT);
  root.file('AI2DVideoStudio.spec', PYINSTALLER_SPEC);
  root.file('README.md', README_MD);
  root.file(
    'SKILL_DIVERGENCE_LOG.md',
    `# Registro de Origem e Divergencias — Skill ai-cinematic-video-creator

- **Contrato Compartilhado**: schemaVersion 1.0.0 (Web <-> Desktop Python/PySide6)
- **Situacao do ZIP original no momento da geracao**: Nao encontrado no workspace.
- **Politica**: Os scripts em \`original_skill/scripts/\` sao substitutos documentados compativeis com o Contrato JSON v1.0 e FFmpeg (libx264 + AAC, CPU-first sem CUDA), incluindo o perfil isolado \`retro_pixel_renderer.py\` para animacoes educativas em pixel art 16-bit. Caso possua o ZIP original, substitua os arquivos em \`original_skill/\` mantendo o adaptador do contrato.
`
  );

  // Desktop app modules
  root.file('app/main.py', APP_MAIN_PY);
  root.file('interface/main_window.py', INTERFACE_MAIN_WINDOW_PY);
  root.file('integrations/ollama_adapter.py', OLLAMA_ADAPTER_PY);
  root.file('tests/test_studio.py', TESTS_STUDIO_PY);

  // Original Skill parity scripts + isolated Retro Pixel Educational renderer
  root.file('original_skill/scripts/_common.py', SKILL_COMMON_PY);
  root.file('original_skill/scripts/probe_env.py', SKILL_PROBE_ENV_PY);
  root.file('original_skill/scripts/validate_plan.py', SKILL_VALIDATE_PLAN_PY);
  root.file('original_skill/scripts/synth_audio.py', SKILL_SYNTH_AUDIO_PY);
  root.file('original_skill/scripts/captions.py', SKILL_CAPTIONS_PY);
  root.file('original_skill/scripts/render_engine.py', SKILL_RENDER_ENGINE_PY);
  root.file('original_skill/scripts/retro_pixel_renderer.py', SKILL_RETRO_PIXEL_RENDERER_PY);
  root.file('original_skill/scripts/build_video.py', SKILL_BUILD_VIDEO_PY);
  root.file('original_skill/scripts/qa_check.py', SKILL_QA_CHECK_PY);
  root.file('original_skill/scripts/tts.py', SKILL_TTS_PY);
  root.file('original_skill/scripts/export_docs.py', SKILL_EXPORT_DOCS_PY);

  // Directory placeholders
  root.file('assets/characters/.gitkeep', '');
  root.file('assets/backgrounds/.gitkeep', '');
  root.file('assets/spritesheets/.gitkeep', '');
  root.file('cache/.gitkeep', '');
  root.file('logs/.gitkeep', '');
  root.file('exports/.gitkeep', '');

  if (activeProject) {
    const safeName = activeProject.title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'projeto_atual';
    root.file(`projects/${safeName}_plan.json`, JSON.stringify(activeProject, null, 2));
  } else {
    root.file('projects/.gitkeep', '');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = 'AI-2D-VIDEO-STUDIO-Windows-Python.zip';
  downloadBlob(blob, filename);
  return filename;
}
