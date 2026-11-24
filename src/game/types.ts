export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type Difficulty = 'CADET' | 'ACE' | 'NIGHTMARE';

export type WeaponType = 'PULSE' | 'SPREAD' | 'PLASMA_HOMING';

export type EnemyType = 'SWARMER' | 'DRONE' | 'INTERCEPTOR' | 'TANK' | 'BOSS';

export type PowerUpType = 'SHIELD' | 'WEAPON_SPREAD' | 'WEAPON_PLASMA' | 'OVERDRIVE' | 'NOVA_CHARGE';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  subtitle: string;
  enemyHpMult: number;
  enemySpeedMult: number;
  enemyFireRateMult: number;
  scoreMult: number;
  startingHp: number;
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  CADET: {
    id: 'CADET',
    label: 'Cadete',
    subtitle: 'Escudo reforçado e cadência equilibrada',
    enemyHpMult: 0.85,
    enemySpeedMult: 0.88,
    enemyFireRateMult: 0.8,
    scoreMult: 1.0,
    startingHp: 120,
  },
  ACE: {
    id: 'ACE',
    label: 'Ás Espacial',
    subtitle: 'Ritmo clássico de arcade e pressão tática',
    enemyHpMult: 1.0,
    enemySpeedMult: 1.0,
    enemyFireRateMult: 1.0,
    scoreMult: 1.25,
    startingHp: 100,
  },
  NIGHTMARE: {
    id: 'NIGHTMARE',
    label: 'Pesadelo',
    subtitle: 'Inimigos implacáveis e multiplicador máximo',
    enemyHpMult: 1.35,
    enemySpeedMult: 1.2,
    enemyFireRateMult: 1.35,
    scoreMult: 1.75,
    startingHp: 80,
  },
};

export interface Vec2 {
  x: number;
  y: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  aimAngle: number;
  bankTilt: number;
  hp: number;
  maxHp: number;
  weapon: WeaponType;
  weaponLevel: number;
  fireCooldown: number;
  muzzleFlash: number;
  recoilOffset: number;
  invulnTimer: number;
  dashCooldown: number;
  dashMaxCooldown: number;
  dashActiveTimer: number;
  dashDirX: number;
  dashDirY: number;
  overdriveTimer: number;
  novaCharge: number; // 0 to 100
  afterimages: Array<{ x: number; y: number; angle: number; alpha: number; color: string }>;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  color: string;
  coreColor: string;
  isEnemy: boolean;
  homing: boolean;
  pierce: number;
  life: number;
  maxLife: number;
  trail: Vec2[];
}

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  scoreValue: number;
  color: string;
  fireTimer: number;
  phaseTimer: number;
  hitFlash: number;
  angle: number;
  patternSeed: number;
}

export interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  vy: number;
  radius: number;
  life: number;
  pulse: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  drag: number;
  glow: boolean;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  lineWidth: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  scale: number;
}

export interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  layer: number;
  tint: string;
}

export interface HudSnapshot {
  gameState: GameState;
  score: number;
  highScore: number;
  bestWave: number;
  wave: number;
  hp: number;
  maxHp: number;
  combo: number;
  comboTimerRatio: number;
  maxCombo: number;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  weapon: WeaponType;
  weaponLevel: number;
  overdriveTimer: number;
  dashReadyRatio: number;
  novaCharge: number;
  autoFire: boolean;
  bossActive: boolean;
  bossHpRatio: number;
  bossName: string;
  waveBanner: string | null;
  isNewRecord: boolean;
}
