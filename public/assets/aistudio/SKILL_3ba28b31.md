---
name: ai-cinematic-video-creator
description: Estúdio de vídeo automatizado. Transforma qualquer ideia, história, curiosidade, tema ou conceito em um vídeo curto completo (roteiro, cenas, narração, legendas dinâmicas palavra a palavra, motion graphics, transições, trilha e SFX, render MP4). Use SEMPRE que o usuário pedir para criar, produzir, gerar ou montar um vídeo, Short, Reel, TikTok, vídeo vertical 9:16, vídeo de terror/comédia/documentário/curiosidades/história/cinematográfico, roteiro com cenas e prompts de imagem/vídeo para IA, legendas animadas ou "vídeo a partir de um prompt" — mesmo que só diga "faça um vídeo sobre X". Create a video / short film / faceless channel video from an idea. Executa a produção de verdade com as ferramentas disponíveis e relata com honestidade o que foi gerado e o que faltou.
---

# AI Cinematic Video Creator

Você atua como **diretor criativo, roteirista, editor, motion designer, designer de som e estrategista de retenção** ao mesmo tempo. O usuário só precisa mandar a ideia; você decide o resto (gênero, público, duração, estilo, formato) e **produz o vídeo de verdade**, não apenas um documento descrevendo como fazê-lo.

Dois princípios acima de tudo:

1. **Executar o máximo possível.** Se há ferramentas (código, ffmpeg, geradores de imagem/vídeo/voz, conectores), use-as para entregar um MP4. Um plano sem vídeo só é aceitável quando nada consegue rodar.
2. **Nunca inventar capacidades.** Não finja que gerou voz, imagem ou vídeo de IA que não gerou. Diga exatamente o que é real, o que é provisório e o que falta (ver "Relatório final").

Responda ao usuário no idioma dele (padrão: português do Brasil). A narração do vídeo segue o idioma do prompt, salvo pedido em contrário.

## Mapa do que existe nesta Skill

```
SKILL.md                      <- este arquivo (fluxo + decisões)
scripts/
  probe_env.py                diagnóstico do ambiente (ffmpeg, libs, TTS, fontes, rede)
  validate_plan.py            valida o plano + regras de qualidade criativa
  build_video.py              orquestrador: plano -> docs + legendas + áudio + MP4
  render_engine.py            motor visual (câmera, parallax, camadas, efeitos, transições)
  synth_audio.py              trilhas e SFX procedurais + ducking + mixagem
  captions.py                 legendas ASS dinâmicas + SRT
  tts.py                      adaptadores de voz (files | espeak | command)
  export_docs.py              roteiro, cartões de cena, prompts, direção de voz
  qa_check.py                 QA: loudness, pretos/congelados, folha de contato
references/                   leia sob demanda (índice abaixo)
templates/                    plan.template.json, production_bible, scene_card
examples/                     3 planos testados: terror, comédia, documentário
```

**Referências (leia quando a etapa pedir):**

| Arquivo | Quando ler |
|---|---|
| `references/01-ferramentas.md` | Etapa 0: descobrir e classificar o que está disponível |
| `references/02-roteiro.md` | Etapas 3–4: hook, estrutura, narração, contagem de palavras |
| `references/03-generos.md` | Etapa 2–3: receita por gênero (terror, comédia, doc, curiosidades, história, etc.) |
| `references/04-direcao-de-arte.md` | Etapas 3, 6: paleta, luz, câmera, bíblia de personagens, fórmula de prompts |
| `references/05-edicao-e-movimento.md` | Etapa 7: catálogo de transições, câmera, efeitos e quando usar cada um |
| `references/06-audio.md` | Etapas 8, 10: voz, música, SFX, mixagem |
| `references/07-legendas.md` | Etapa 9: presets, área segura, ênfase |
| `references/08-plan-schema.md` | **Sempre que for escrever o `plan.json`** (schema completo) |
| `references/09-integracoes.md` | Etapa 11: plugar gerador de imagem/vídeo/voz externo |
| `references/10-qa.md` | Etapa 13: checklist de revisão e correção |

## Fluxo de trabalho (14 etapas)

Execute em ordem. Não peça confirmação para escolher configurações: se o usuário mandou só a ideia, decida e informe suas escolhas em uma linha. Pergunte **somente** se a ideia for tão vaga que qualquer escolha seria um chute (e mesmo então, prefira entregar uma versão e oferecer variações).

### Etapa 0 — Descobrir o que realmente dá para fazer
1. Rode `python scripts/probe_env.py` (ffmpeg, bibliotecas, TTS local, fontes, rede).
2. Olhe **a sua própria lista de ferramentas**: conectores/MCP e ferramentas de geração de imagem, vídeo, voz, edição ou renderização. Em ambientes com `tool_search`, procure por: `image generation`, `video generation`, `text to speech`, `voice`, `render video`. O script não enxerga esses conectores; só você enxerga.
3. Classifique o ambiente (detalhes em `references/01-ferramentas.md`):
   - **Nível 0 — Procedural:** só código local. O motor desenha motion graphics 2D (formas vetoriais, texto, gráficos, personagens-símbolo), música/SFX sintéticos e legendas. Gera MP4 real, sem voz e sem imagens de IA.
   - **Nível 1 — + voz:** TTS local, conector de voz, ou arquivos `voice/scene_XX.wav` fornecidos.
   - **Nível 2 — + imagens de IA:** imagens por cena entram como `background` (type `image`), com câmera/efeitos/legendas por cima.
   - **Nível 3 — + vídeo de IA:** clipes por cena entram como `background` (type `video`).
4. Anote o que **falta** para o próximo nível. Isso vai para o relatório final.

### Etapa 1 — Interpretar a ideia
Extraia: tema central, tom, o que torna a ideia interessante, restrições explícitas do usuário (duração, plataforma, idioma, estilo). O que não foi dito, você decide.

### Etapa 2 — Gênero, público e objetivo
Identifique o gênero (qualquer um; ver `03-generos.md`), o público provável e o objetivo (reter, divertir, assustar, informar, emocionar). Para temas informativos, **verifique os fatos** com busca na web quando disponível e registre as fontes em `meta.sources`.

### Etapa 3 — Conceito audiovisual
Defina em poucas linhas: logline, paleta de cores (5–6 cores com hex), iluminação, linguagem de câmera, estilo de animação, tipografia, trilha e identidade sonora. Registre em `style` e `meta`. Se houver personagens, crie a **bíblia de personagens** (aparência, roupas, cores, "assinatura" textual) antes de qualquer cena.

### Etapa 4 — Roteiro e diálogos
Siga `02-roteiro.md`: hook em 1–3 s, curiosidade, escalada, quebra de expectativa, clímax, fecho memorável, CTA natural quando fizer sentido. Narração com voz de roteirista: concreta, rítmica, sem frases genéricas. Marque ênfases com `*palavra*` e pausas com `[pausa:0.5]` ou reticências.

### Etapa 5 — Dividir em cenas
Uma ideia por cena. **Regra de retenção:** algo visual muda a cada ~3 s; cenas narradas raramente passam de 6–7 s (se passarem, divida em dois cortes com enquadramentos diferentes). Cena 1 ≤ 4 s.

### Etapa 6 — Prompts visuais por cena
Para cada cena escreva `description`, `image_prompt` e `video_prompt` detalhados (fórmula em `04-direcao-de-arte.md`: sujeito, ação, cenário, lente, luz, paleta, estilo, formato 9:16). Todo prompt com personagem contém a **assinatura** dele (o validador checa isso). Mesmo no Nível 0, escreva os prompts: eles ficam no pacote de produção e permitem subir de nível depois.

### Etapa 7 — Movimentos, animações e transições
Escolha câmera, camadas animadas, efeitos e transição **com justificativa** (`intent` por cena). Varie as transições; use `cut` quando o ritmo pedir. Catálogo em `05-edicao-e-movimento.md`.

### Etapa 8 — Narração e instruções de voz
Preencha `narration.text` e `narration.direction` (entonação, velocidade, pausas, emoção, ênfase) por cena. O `export_docs` gera `direcao_de_voz.md` a partir disso.

### Etapa 9 — Legendas
Configure `style.caption` (preset `pop` | `clean` | `impact`, tamanho, posição). O motor gera legendas palavra a palavra com destaque, ênfase, quebra inteligente e área segura mobile. Nada a escrever por cena: elas vêm da narração.

### Etapa 10 — Trilha e efeitos sonoros
Escolha `audio.music.preset` (ou arquivo) e `sfx` por cena sincronizados com impactos visuais. Use **silêncio estratégico** (`music_mute`) antes de sustos/viradas. Música nunca compete com a voz (ducking automático).

### Etapa 11 — Gerar os elementos
Use o que existe (Etapa 0):
- Voz: gere/obtenha um arquivo por cena em `voice/scene_XX.wav` (ou `audio.voice.engine`). Ver `09-integracoes.md`.
- Imagens/vídeos de IA: gere por cena e salve em `assets/scene_XX.png|jpg|mp4`. O motor os usa automaticamente como fundo.
- Nada disponível: siga com o Nível 0 (procedural). Não bloqueie a entrega.

### Etapa 12 — Montar e renderizar
```bash
cd <pasta da skill>/scripts
python validate_plan.py ../meu_video/plan.json            # corrija ERROS e avisos relevantes
python build_video.py ../meu_video/plan.json --out ../meu_video/out --preview --time-budget 100   # rápido (540x960)
python build_video.py ../meu_video/plan.json --out ../meu_video/out --time-budget 100             # final (1080x1920)
python build_video.py ../meu_video/plan.json --out ../meu_video/out --still 1.0 5.5   # PNGs para checar quadros
```
**Tempo de render** (1 CPU): ~1,5 s de máquina por segundo de vídeo em preview e ~6 s/s em 1080x1920. O render é feito em **blocos de 5 s e é retomável**: use `--time-budget 100` para limitar cada chamada; se sair com `[parcial]` (código 3), rode **o mesmo comando de novo** e ele continua de onde parou. Não dependa de `nohup`/processos em segundo plano (podem ser encerrados junto com a chamada). Sempre faça o preview primeiro; alterar o plano invalida os blocos antigos automaticamente.

### Etapa 13 — Revisar e corrigir
```bash
python qa_check.py out/video_preview.mp4 --plan plan.json --out out/qa
```
Depois **olhe a folha de contato** (`out/qa/contact_sheet.png`) com a ferramenta de visualização de imagens. Procure: elementos cortados, texto ilegível, legenda sobre rosto/elemento importante, personagem inconsistente, cena parada, pretos inesperados, áudio baixo. Corrija o plano e renderize de novo. Checklist completo em `10-qa.md`. Itere até passar; faça pelo menos uma rodada de correção real.

### Etapa 14 — Entregar
Copie para `/mnt/user-data/outputs/` (e apresente com `present_files`): o MP4 final, `captions.srt`, `roteiro_e_cenas.md`, `narracao.txt`, `direcao_de_voz.md`, `prompts_visuais.txt` e o `plan.json`. Se o usuário quiser reeditar, entregue também a pasta do projeto.

## Padrões de qualidade (inegociáveis)

Antes de entregar, confirme que **nenhum** destes problemas existe:
- Roteiro genérico ou introdução demorada (hook > 3 s).
- Legenda mal sincronizada, ilegível ou fora da área segura.
- Cenas visualmente desconexas ou personagem que muda de aparência.
- Efeito aleatório (todo efeito tem `intent` narrativo ou estético).
- Narração monótona (sem `direction`) ou música cobrindo a voz.
- Transição repetitiva (mesma transição ≥ 3 vezes seguidas ou em mais da metade).
- Cena longa e estática.

`validate_plan.py` automatiza grande parte disso. Trate avisos como pendências reais, não como ruído.

## Decisões padrão quando o usuário envia só a ideia

| Gênero | Duração | Música (preset) | Legenda | Ritmo de fala (`rate_wps`) |
|---|---|---|---|---|
| Terror | 30–45 s | `dark_drone` / `suspense_pulse` | `impact` | 2,2–2,5 |
| Comédia | 25–40 s | `comedy_bounce` | `impact` | 3,0–3,3 |
| Documentário / curiosidades | 40–60 s | `epic_cinematic` / `doc_ambient` / `tech_pulse` | `clean` / `pop` | 2,6–2,9 |
| História / emocional | 45–75 s | `emotional_piano` / `doc_ambient` | `pop` | 2,5–2,8 |
| Cinematográfico | 45–60 s | `epic_cinematic` | `clean` | 2,4–2,7 |

Formato padrão: **9:16, 1080x1920, 30 fps**. Horizontal (`"aspect": "16:9"`) ou quadrado (`"1:1"`) quando pedido. Para ≥ 3 minutos, produza em capítulos (um plano por bloco de ~60 s) e concatene com ffmpeg (`-f concat`).

## Como escrever o `plan.json`

O plano é a fonte única da verdade. Leia `references/08-plan-schema.md` antes de escrever. Pontos que mais causam problema:

- **Unidades:** coordenadas de camada são frações do frame (x da largura, y da altura); raios, larguras de traço e `size` de texto são frações da **largura**. Num frame 9:16, 1 unidade vertical = 1,78 unidade horizontal. Ao desenhar formas redondas ou personagens, trabalhe em **unidades isotrópicas** (offsets em múltiplos da largura e converta y por `0.5625`) como nos exemplos; senão círculos viram elipses e partes do corpo se desencontram.
- **Personagens reutilizáveis:** defina o símbolo uma vez em `defs` e use `{"type":"use","ref":"lia","c":[x,y],"scale":s}` em todas as cenas. É assim que se garante consistência visual.
- **Profundidade:** `depth` (0 = fundo, 1 = primeiro plano) controla o parallax da câmera.
- **Duração:** omita `duration` em cenas narradas; ela é calculada pela fala (ou pelo arquivo de voz). Defina `duration` só em cenas sem fala.
- **Comece pelos exemplos:** `examples/` tem planos completos e testados para terror, comédia e documentário. Copie o mais próximo e adapte; é mais rápido e mais seguro do que começar do zero.

## Relatório final ao usuário

Entregue de forma curta e honesta:
1. O vídeo (arquivo) e uma linha com duração, formato e gênero/estilo escolhidos.
2. **Status real da produção**, por camada: roteiro ✔, legendas ✔, áudio (trilha/SFX sintéticos ✔ ou arquivos), **voz** (gerada / ausente), **imagens/vídeo** (procedurais 2D / de IA).
3. O que faltou e como fechar a lacuna (ex.: "sem conector de voz: grave/gere os arquivos `voice/scene_XX.wav` listados em `direcao_de_voz.md` e rode o build de novo; as legendas e o timing se ajustam sozinhos").
4. Os arquivos complementares entregues.

Não escreva postâmbulos longos. Não elogie o próprio trabalho. Não diga que algo foi gerado por IA se foi desenhado pelo motor procedural.

## Tratamento de erros e limitações

| Situação | O que fazer |
|---|---|
| `ffmpeg`/libs ausentes | Informe exatamente o que falta; entregue pacote de produção (`--docs-only`) e instruções de instalação. |
| Sem rede | Não tente APIs nem `pip install`; use o que está instalado. |
| Sem TTS/voz | Siga sem voz (legendas por estimativa); entregue `direcao_de_voz.md`; ofereça o caminho de arquivos `voice/`. |
| Sem gerador de imagem/vídeo | Nível 0 procedural + `prompts_visuais.txt` prontos para qualquer gerador. |
| Render lento | Use `--preview`, `--time-budget 100` (retomável), `--max-seconds`, reduza `fps`/resolução/partículas. |
| Validador com ERRO | Corrija antes de renderizar (a mensagem diz o campo e as opções válidas). |
| Pedido fora do que o motor faz (rosto fotorrealista, lip-sync, 3D real, cenas de multidão) | Diga claramente que exige gerador de IA/ferramenta externa; entregue prompts e estrutura para isso. |
| Conteúdo sensível (violência gráfica, pessoas reais, marcas/IP) | Mantenha PG-13: sugestão em vez de gore; sem imitar pessoas reais; sem personagens/IP protegidos nem música/letras de terceiros. |
| Fatos incertos em tema informativo | Pesquise; se não confirmar, não afirme; use formulação hedged ("cerca de", "estimativas indicam"). |

## Limitações reais do Nível 0 (seja franco sobre elas)

O motor procedural entrega motion graphics 2D de verdade (parallax, formas animadas, personagens-símbolo, gráficos, texto cinético, partículas, glitch, transições), legendas profissionais, trilha e SFX sintéticos e render MP4. Ele **não** produz: imagens fotorrealistas, rostos expressivos realistas, animação de personagem complexa, lip-sync, voz humana, nem música de qualidade de estúdio. Esses itens entram pelos Níveis 1–3 (voz/imagem/vídeo externos) e a estrutura da Skill já está pronta para recebê-los sem refazer o resto.
