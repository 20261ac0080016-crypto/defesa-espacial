import { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { SpaceDefenderEngine } from './game/engine';
import {
  DIFFICULTY_CONFIGS,
  Difficulty,
  HudSnapshot,
  WeaponType,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  gameState: 'TITLE_MENU',
  score: 0,
  highScore: 0,
  bestWave: 1,
  wave: 1,
  hp: 100,
  maxHp: 100,
  combo: 1.0,
  comboTimerRatio: 0,
  maxCombo: 1.0,
  kills: 0,
  shotsFired: 0,
  shotsHit: 0,
  weapon: 'PULSE',
  weaponLevel: 1,
  overdriveTimer: 0,
  dashReadyRatio: 1,
  novaCharge: 35,
  autoFire: false,
  bossActive: false,
  bossHpRatio: 0,
  bossName: '',
  waveBanner: null,
  isNewRecord: false,
};

const WEAPON_LABELS: Record<WeaponType, string> = {
  PULSE: 'Pulso',
  SPREAD: 'Dispersão',
  PLASMA_HOMING: 'Plasma',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SpaceDefenderEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [difficulty, setDifficulty] = useState<Difficulty>('ACE');
  const [muted, setMuted] = useState<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new SpaceDefenderEngine(canvas, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    engine.startLoop();

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const handleStartGame = () => {
    engineRef.current?.startGame(difficulty);
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.sound.setMuted(next);
  };

  const handleTogglePause = () => {
    engineRef.current?.togglePause();
  };

  const handleToggleAutoFire = () => {
    engineRef.current?.toggleAutoFire();
  };

  const handleSwitchWeapon = (w: WeaponType) => {
    engineRef.current?.switchWeapon(w);
  };

  const handleTriggerNova = () => {
    engineRef.current?.triggerNova();
  };

  const handleTriggerDash = () => {
    engineRef.current?.triggerDash();
  };

  const handleReturnToTitle = () => {
    engineRef.current?.returnToTitle();
  };

  const hpPercent = hud.maxHp > 0 ? Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100)) : 0;
  const isLowHp = hpPercent <= 30;
  const accuracy =
    hud.shotsFired > 0 ? Math.min(100, Math.round((hud.shotsHit / hud.shotsFired) * 100)) : 0;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#05070e] text-slate-100">
      {/* Main 2D Game Canvas */}
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none ${
          hud.gameState === 'PLAYING' ? 'cursor-crosshair' : 'cursor-default'
        }`}
      />

      {/* Active Gameplay HUD */}
      {(hud.gameState === 'PLAYING' || hud.gameState === 'PAUSED') && (
        <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 bg-[#05070e]/80 px-4 py-2.5 backdrop-blur-md md:px-6">
            {/* Left Zone: Shield + Abilities */}
            <div className="pointer-events-auto flex items-center gap-4">
              <div className="flex flex-col gap-1 min-w-[136px] sm:min-w-[172px]">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <Shield className={`h-3.5 w-3.5 ${isLowHp ? 'text-rose-400' : 'text-cyan-400'}`} />
                    <span>Escudo</span>
                  </span>
                  <span
                    className={`font-mono-tabular text-xs font-bold ${
                      isLowHp ? 'text-rose-400' : 'text-slate-100'
                    }`}
                  >
                    {hud.hp}/{hud.maxHp}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-sm bg-slate-800">
                  <div
                    className={`h-full transition-all duration-150 ${
                      isLowHp ? 'bg-rose-500' : 'bg-cyan-400'
                    }`}
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerDash}
                  title="Atalho: Shift ou Clique Direito"
                  className="flex h-10 items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-200 whitespace-nowrap shrink-0"
                >
                  <span>Dash</span>
                  <span className="font-mono-tabular text-cyan-300">
                    {Math.round(hud.dashReadyRatio * 100)}%
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleTriggerNova}
                  disabled={hud.novaCharge < 100}
                  title="Atalho: E ou Q"
                  className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    hud.novaCharge >= 100
                      ? 'border-sky-400 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30 cursor-pointer'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Nova</span>
                  <span className="font-mono-tabular">{hud.novaCharge}%</span>
                </button>
              </div>
            </div>

            {/* Center Zone: Wave, Score, Combo */}
            <div className="flex items-center gap-4 sm:gap-7">
              <div className="text-center">
                <div className="text-[11px] font-medium text-slate-400 whitespace-nowrap">Onda</div>
                <div className="font-mono-tabular text-base sm:text-lg font-bold text-slate-100">
                  {String(hud.wave).padStart(2, '0')}
                </div>
              </div>

              <div className="text-center">
                <div className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
                  Pontuação
                </div>
                <div className="font-mono-tabular text-base sm:text-xl font-bold text-cyan-300">
                  {hud.score.toLocaleString('pt-BR')}
                </div>
              </div>

              <div className="hidden sm:block text-center min-w-[68px]">
                <div className="text-[11px] font-medium text-slate-400 whitespace-nowrap">Combo</div>
                <div
                  className={`font-mono-tabular text-base font-bold ${
                    hud.combo >= 3
                      ? 'text-amber-300'
                      : hud.combo > 1
                      ? 'text-emerald-300'
                      : 'text-slate-400'
                  }`}
                >
                  x{hud.combo.toFixed(1)}
                </div>
              </div>
            </div>

            {/* Right Zone: Weapons & Controls */}
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-1 rounded-lg bg-slate-900/90 p-1 border border-slate-800">
                {(['PULSE', 'SPREAD', 'PLASMA_HOMING'] as WeaponType[]).map((w, idx) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => handleSwitchWeapon(w)}
                    className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      hud.weapon === w
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {idx + 1}. {WEAPON_LABELS[w]}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleToggleAutoFire}
                aria-pressed={hud.autoFire}
                title="Alternar disparo automático (Tecla F)"
                className={`hidden sm:flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  hud.autoFire
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                    : 'border-slate-700/80 bg-slate-900/90 text-slate-300 hover:text-white'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                <span>{hud.autoFire ? 'Auto: Ligado' : 'Auto: Desligado'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Ativar som' : 'Silenciar som'}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-slate-200 transition-colors hover:border-slate-500 hover:text-white shrink-0"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={handleTogglePause}
                aria-label="Pausar jogo"
                className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white whitespace-nowrap shrink-0"
              >
                <Pause className="h-4 w-4" />
                <span className="hidden sm:inline">Pausar</span>
              </button>
            </div>
          </div>

          {/* Boss Health Bar */}
          {hud.bossActive && (
            <div className="mx-auto mt-3 w-full max-w-md px-4">
              <div className="rounded-lg border border-rose-500/40 bg-[#070a14]/90 px-3.5 py-2 backdrop-blur-sm">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-rose-300">
                  <span>{hud.bossName}</span>
                  <span className="font-mono-tabular">{Math.round(hud.bossHpRatio * 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-sm bg-slate-800">
                  <div
                    className="h-full bg-rose-500 transition-all duration-100"
                    style={{ width: `${hud.bossHpRatio * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Overdrive Active Notice */}
          {hud.overdriveTimer > 0 && (
            <div className="mx-auto mt-2 text-xs font-semibold text-amber-300 font-mono-tabular">
              Sobrecarga ativa · {hud.overdriveTimer.toFixed(1)}s
            </div>
          )}
        </header>
      )}

      {/* Wave Banner Overlay */}
      {hud.gameState === 'PLAYING' && hud.waveBanner && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-10 flex justify-center px-4">
          <div className="rounded-lg border border-cyan-400/30 bg-[#05070e]/75 px-5 py-2 text-center backdrop-blur-sm">
            <p className="font-display text-lg sm:text-2xl font-bold tracking-wide text-cyan-200">
              {hud.waveBanner}
            </p>
          </div>
        </div>
      )}

      {/* Mobile Touch Ability Buttons during Play */}
      {hud.gameState === 'PLAYING' && (
        <div className="fixed bottom-4 right-4 z-20 flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={handleTriggerDash}
            className="flex h-11 items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-slate-900/90 px-3.5 text-xs font-semibold text-cyan-200 whitespace-nowrap"
          >
            Dash {Math.round(hud.dashReadyRatio * 100)}%
          </button>
          <button
            type="button"
            onClick={handleTriggerNova}
            disabled={hud.novaCharge < 100}
            className={`flex h-11 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold whitespace-nowrap ${
              hud.novaCharge >= 100
                ? 'border-sky-400 bg-sky-500/30 text-white'
                : 'border-slate-800 bg-slate-900/80 text-slate-500'
            }`}
          >
            Nova {hud.novaCharge}%
          </button>
        </div>
      )}

      {/* Title Menu Overlay */}
      {hud.gameState === 'TITLE_MENU' && (
        <main className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-[#080c18]/92 p-6 sm:p-10 shadow-2xl backdrop-blur-md">
            <div className="flex flex-col gap-6">
              {/* Header & Records */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">
                    Neon Space Defender
                  </h1>
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    aria-label={muted ? 'Ativar som' : 'Silenciar som'}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 transition-colors hover:border-cyan-400/60 hover:text-white shrink-0"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                </div>

                <p className="text-base text-slate-300 leading-relaxed max-w-xl">
                  Pilote sua nave vetorizada, desvie de barragens de plasma e elimine esquadrões
                  progressivos com armas aprimoráveis.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1 text-sm text-slate-400 font-mono-tabular">
                  <span>Recorde: {hud.highScore.toLocaleString('pt-BR')} pts</span>
                  <span aria-hidden="true">·</span>
                  <span>Melhor onda: {String(hud.bestWave).padStart(2, '0')}</span>
                </div>
              </div>

              <hr className="border-slate-800" />

              {/* Difficulty Segmented Selector */}
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold text-slate-200">Dificuldade</span>
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-900/90 p-1 border border-slate-800">
                  {(['CADET', 'ACE', 'NIGHTMARE'] as Difficulty[]).map((diffKey) => {
                    const cfg = DIFFICULTY_CONFIGS[diffKey];
                    const active = difficulty === diffKey;
                    return (
                      <button
                        key={diffKey}
                        type="button"
                        onClick={() => setDifficulty(diffKey)}
                        className={`h-10 rounded-md px-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-cyan-500 text-slate-950'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400">
                  {DIFFICULTY_CONFIGS[difficulty].subtitle} · Escudo inicial:{' '}
                  <span className="font-mono-tabular text-slate-200">
                    {DIFFICULTY_CONFIGS[difficulty].startingHp}
                  </span>
                </p>
              </div>

              {/* Controls Guide */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="py-1">
                  <div className="font-mono-tabular text-xs font-semibold text-cyan-300">
                    WASD / Setas
                  </div>
                  <div className="text-slate-300">Mover nave</div>
                </div>
                <div className="py-1">
                  <div className="font-mono-tabular text-xs font-semibold text-cyan-300">
                    Mouse / Espaço
                  </div>
                  <div className="text-slate-300">Mirar e atirar</div>
                </div>
                <div className="py-1">
                  <div className="font-mono-tabular text-xs font-semibold text-cyan-300">
                    Shift / Dir.
                  </div>
                  <div className="text-slate-300">Hyper-Dash</div>
                </div>
                <div className="py-1">
                  <div className="font-mono-tabular text-xs font-semibold text-cyan-300">
                    Tecla E / 1-3
                  </div>
                  <div className="text-slate-300">Nova / Armas</div>
                </div>
              </div>

              {/* Primary CTA */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleStartGame}
                  className="flex h-12 items-center justify-center gap-2.5 rounded-lg bg-cyan-400 px-8 text-base font-bold text-slate-950 transition-colors hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Iniciar Missão</span>
                </button>

                <span className="text-xs text-slate-400">
                  Tecla <span className="font-mono-tabular text-slate-200">F</span> ativa disparo
                  contínuo · <span className="font-mono-tabular text-slate-200">M</span> alterna mira
                </span>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Pause Modal */}
      {hud.gameState === 'PAUSED' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#080c18] p-6 shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-white">Jogo Pausado</h2>
            <p className="mt-1 text-sm text-slate-400 font-mono-tabular">
              Onda {String(hud.wave).padStart(2, '0')} · {hud.score.toLocaleString('pt-BR')} pontos
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleTogglePause}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Continuar</span>
              </button>

              <button
                type="button"
                onClick={handleStartGame}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reiniciar Missão</span>
              </button>

              <button
                type="button"
                onClick={handleReturnToTitle}
                className="flex h-11 w-full items-center justify-center rounded-lg border border-slate-800 bg-transparent px-4 text-sm font-medium text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200 whitespace-nowrap cursor-pointer"
              >
                Voltar ao Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {hud.gameState === 'GAME_OVER' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#080c18] p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-3xl font-bold text-white">Fim de Missão</h2>
              <p className="text-sm text-slate-400">
                {hud.isNewRecord
                  ? 'Novo recorde pessoal registrado.'
                  : `Recorde atual: ${hud.highScore.toLocaleString('pt-BR')} pts`}
              </p>
            </div>

            <div className="my-6 grid grid-cols-2 gap-4 border-y border-slate-800 py-5">
              <div>
                <div className="text-xs text-slate-400">Pontuação Final</div>
                <div className="font-mono-tabular text-2xl font-bold text-cyan-300">
                  {hud.score.toLocaleString('pt-BR')}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Onda Alcançada</div>
                <div className="font-mono-tabular text-2xl font-bold text-slate-100">
                  {String(hud.wave).padStart(2, '0')}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Naves Destruídas</div>
                <div className="font-mono-tabular text-xl font-semibold text-slate-200">
                  {hud.kills}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Combo Máx. · Precisão</div>
                <div className="font-mono-tabular text-xl font-semibold text-slate-200">
                  x{hud.maxCombo.toFixed(1)} · {accuracy}%
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleStartGame}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Jogar Novamente</span>
              </button>

              <button
                type="button"
                onClick={handleReturnToTitle}
                className="flex h-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white whitespace-nowrap cursor-pointer"
              >
                Menu Principal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
