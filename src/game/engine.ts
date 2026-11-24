import { SoundEngine } from './audio';
import {
  DIFFICULTY_CONFIGS,
  Difficulty,
  Enemy,
  EnemyType,
  FloatingText,
  GameState,
  HudSnapshot,
  Particle,
  Player,
  PowerUp,
  PowerUpType,
  Projectile,
  Shockwave,
  Star,
  WeaponType,
} from './types';

const STORAGE_KEY = 'neon_space_defender_records_v1';

interface StoredRecords {
  highScore: number;
  bestWave: number;
}

function loadRecords(): StoredRecords {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { highScore: 0, bestWave: 1 };
    const parsed = JSON.parse(raw) as Partial<StoredRecords>;
    return {
      highScore: typeof parsed.highScore === 'number' ? parsed.highScore : 0,
      bestWave: typeof parsed.bestWave === 'number' ? parsed.bestWave : 1,
    };
  } catch {
    return { highScore: 0, bestWave: 1 };
  }
}

function saveRecords(records: StoredRecords): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota errors
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function lerpAngle(current: number, target: number, factor: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * factor;
}

export class SpaceDefenderEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public sound: SoundEngine;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private width: number = 1280;
  private height: number = 720;
  private dpr: number = 1;

  private rafId: number | null = null;
  private lastTimestamp: number = 0;
  private hudSyncAccumulator: number = 0;

  private gameState: GameState = 'TITLE_MENU';
  private difficulty: Difficulty = 'ACE';
  private autoFire: boolean = false;
  private freeAim: boolean = true;

  private score: number = 0;
  private highScore: number = 0;
  private bestWave: number = 1;
  private isNewRecord: boolean = false;
  private wave: number = 1;
  private waveEnemiesRemainingToSpawn: number = 0;
  private spawnTimer: number = 0;
  private waveTransitionTimer: number = 0;
  private waveBanner: string | null = null;
  private waveBannerTimer: number = 0;

  private combo: number = 1.0;
  private comboTimer: number = 0;
  private readonly comboMaxTime: number = 4.2;
  private maxCombo: number = 1.0;
  private kills: number = 0;
  private shotsFired: number = 0;
  private shotsHit: number = 0;

  private nextEntityId: number = 1;
  private screenShake: number = 0;
  private gridPulse: number = 0;
  private globalTime: number = 0;

  private player: Player;
  private projectiles: Projectile[] = [];
  private enemies: Enemy[] = [];
  private powerUps: PowerUp[] = [];
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private floatingTexts: FloatingText[] = [];
  private stars: Star[] = [];

  // Input state
  private keys: Set<string> = new Set();
  private mouseX: number = 0;
  private mouseY: number = 0;
  private mouseActive: boolean = false;
  private mouseDown: boolean = false;
  private touchActive: boolean = false;
  private touchTargetX: number | null = null;
  private touchTargetY: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    onHudUpdate: (snapshot: HudSnapshot) => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.sound = new SoundEngine();
    this.onHudUpdate = onHudUpdate;

    const records = loadRecords();
    this.highScore = records.highScore;
    this.bestWave = records.bestWave;

    this.player = this.createInitialPlayer();
    this.resize();
    this.initStarfield();
    this.attachInputListeners();
    this.emitHud();
  }

  private createInitialPlayer(): Player {
    const cfg = DIFFICULTY_CONFIGS[this.difficulty];
    return {
      x: this.width * 0.5,
      y: this.height * 0.8,
      vx: 0,
      vy: 0,
      radius: 17,
      aimAngle: -Math.PI / 2,
      bankTilt: 0,
      hp: cfg.startingHp,
      maxHp: cfg.startingHp,
      weapon: 'PULSE',
      weaponLevel: 1,
      fireCooldown: 0,
      muzzleFlash: 0,
      recoilOffset: 0,
      invulnTimer: 1.5,
      dashCooldown: 0,
      dashMaxCooldown: 2.0,
      dashActiveTimer: 0,
      dashDirX: 0,
      dashDirY: -1,
      overdriveTimer: 0,
      novaCharge: 35,
      afterimages: [],
    };
  }

  public resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect?.width || window.innerWidth));
    const h = Math.max(320, Math.floor(rect?.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.player.x = clamp(this.player.x, 30, this.width - 30);
    this.player.y = clamp(this.player.y, 40, this.height - 30);

    if (this.stars.length === 0) {
      this.initStarfield();
    }
  }

  private initStarfield(): void {
    this.stars = [];
    const total = Math.min(180, Math.floor((this.width * this.height) / 6500));
    const tints = ['#e2e8f0', '#67e8f9', '#a5f3fc', '#f0abfc', '#fde68a'];
    for (let i = 0; i < total; i++) {
      const layer = i % 3;
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: layer === 0 ? 1.0 : layer === 1 ? 1.6 : 2.3,
        speed: layer === 0 ? 22 : layer === 1 ? 52 : 110,
        alpha: layer === 0 ? 0.35 : layer === 1 ? 0.6 : 0.9,
        layer,
        tint: tints[i % tints.length],
      });
    }
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(rawDt, 0.05);

      this.update(dt);
      this.render();

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.detachInputListeners();
    this.sound.dispose();
  }

  public setDifficulty(diff: Difficulty): void {
    this.difficulty = diff;
  }

  public toggleAutoFire(): boolean {
    this.autoFire = !this.autoFire;
    this.emitHud();
    return this.autoFire;
  }

  public toggleFreeAim(): boolean {
    this.freeAim = !this.freeAim;
    this.emitHud();
    return this.freeAim;
  }

  public startGame(difficulty?: Difficulty): void {
    if (difficulty) {
      this.difficulty = difficulty;
    }
    this.score = 0;
    this.isNewRecord = false;
    this.wave = 1;
    this.combo = 1.0;
    this.comboTimer = 0;
    this.maxCombo = 1.0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.screenShake = 0;
    this.gridPulse = 0.6;

    this.projectiles = [];
    this.enemies = [];
    this.powerUps = [];
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];

    this.player = this.createInitialPlayer();
    this.mouseX = this.width * 0.5;
    this.mouseY = this.height * 0.25;

    this.gameState = 'PLAYING';
    this.startWave(1);
    this.emitHud();
  }

  public togglePause(): void {
    if (this.gameState === 'PLAYING') {
      this.gameState = 'PAUSED';
      this.emitHud();
    } else if (this.gameState === 'PAUSED') {
      this.gameState = 'PLAYING';
      this.lastTimestamp = performance.now();
      this.emitHud();
    }
  }

  public returnToTitle(): void {
    this.gameState = 'TITLE_MENU';
    this.enemies = [];
    this.projectiles = [];
    this.powerUps = [];
    this.waveBanner = null;
    this.emitHud();
  }

  private startWave(waveNum: number): void {
    this.wave = waveNum;
    if (waveNum > this.bestWave) {
      this.bestWave = waveNum;
      saveRecords({ highScore: this.highScore, bestWave: this.bestWave });
    }

    const isBossWave = waveNum % 5 === 0;
    if (isBossWave) {
      this.waveEnemiesRemainingToSpawn = 0;
      this.spawnBoss(waveNum);
      this.waveBanner = `ONDA ${String(waveNum).padStart(2, '0')} — ALERTA DE CHEFE`;
    } else {
      this.waveEnemiesRemainingToSpawn = 7 + Math.floor(waveNum * 3.2);
      this.spawnTimer = 0.4;
      this.waveBanner = `ONDA ${String(waveNum).padStart(2, '0')}`;
    }

    this.waveBannerTimer = 2.4;
    this.gridPulse = 0.5;
    this.sound.playWaveClear();
  }

  private spawnBoss(waveNum: number): void {
    const cfg = DIFFICULTY_CONFIGS[this.difficulty];
    const tier = Math.floor(waveNum / 5);
    const maxHp = Math.round((460 + tier * 280) * cfg.enemyHpMult);

    this.enemies.push({
      id: this.nextEntityId++,
      type: 'BOSS',
      x: this.width * 0.5,
      y: -85,
      vx: 75 * cfg.enemySpeedMult,
      vy: 0,
      radius: 48,
      hp: maxHp,
      maxHp,
      speed: 85 * cfg.enemySpeedMult,
      scoreValue: 1500 * tier,
      color: '#f43f5e',
      fireTimer: 1.4,
      phaseTimer: 0,
      hitFlash: 0,
      angle: Math.PI / 2,
      patternSeed: Math.random() * 10,
    });
  }

  private spawnWaveEnemy(): void {
    const cfg = DIFFICULTY_CONFIGS[this.difficulty];
    const roll = Math.random();
    let type: EnemyType = 'DRONE';

    if (this.wave >= 4 && roll < 0.16) {
      type = 'TANK';
    } else if (this.wave >= 3 && roll < 0.36) {
      type = 'INTERCEPTOR';
    } else if (roll < 0.68) {
      type = 'SWARMER';
    } else {
      type = 'DRONE';
    }

    // Spawn a tight squadron of swarmers sometimes
    if (type === 'SWARMER' && this.waveEnemiesRemainingToSpawn >= 2 && Math.random() < 0.55) {
      const baseX = 70 + Math.random() * (this.width - 140);
      const count = Math.min(3, this.waveEnemiesRemainingToSpawn);
      for (let i = 0; i < count; i++) {
        this.createEnemy('SWARMER', clamp(baseX + (i - 1) * 44, 40, this.width - 40), -30 - i * 32, cfg);
      }
      this.waveEnemiesRemainingToSpawn -= count;
      return;
    }

    const x = 60 + Math.random() * (this.width - 120);
    this.createEnemy(type, x, -36, cfg);
    this.waveEnemiesRemainingToSpawn -= 1;
  }

  private createEnemy(
    type: EnemyType,
    x: number,
    y: number,
    cfg: typeof DIFFICULTY_CONFIGS[Difficulty]
  ): void {
    const waveScale = 1 + (this.wave - 1) * 0.11;
    let radius = 16;
    let baseHp = 24;
    let baseSpeed = 120;
    let scoreValue = 100;
    let color = '#a855f7';
    let fireTimer = 1.4 + Math.random() * 1.2;

    if (type === 'SWARMER') {
      radius = 13;
      baseHp = 14;
      baseSpeed = 175;
      scoreValue = 75;
      color = '#fb7185';
      fireTimer = 999; // Swarmers rely on speed & weaving
    } else if (type === 'DRONE') {
      radius = 17;
      baseHp = 28;
      baseSpeed = 95;
      scoreValue = 120;
      color = '#c084fc';
      fireTimer = 1.2 + Math.random() * 1.0;
    } else if (type === 'INTERCEPTOR') {
      radius = 15;
      baseHp = 34;
      baseSpeed = 155;
      scoreValue = 180;
      color = '#fb923c';
      fireTimer = 1.1 + Math.random() * 0.7;
    } else if (type === 'TANK') {
      radius = 27;
      baseHp = 95;
      baseSpeed = 58;
      scoreValue = 320;
      color = '#f43f5e';
      fireTimer = 1.6 + Math.random() * 0.8;
    }

    const hp = Math.round(baseHp * waveScale * cfg.enemyHpMult);

    this.enemies.push({
      id: this.nextEntityId++,
      type,
      x,
      y,
      vx: 0,
      vy: baseSpeed * cfg.enemySpeedMult,
      radius,
      hp,
      maxHp: hp,
      speed: baseSpeed * cfg.enemySpeedMult,
      scoreValue,
      color,
      fireTimer,
      phaseTimer: Math.random() * Math.PI * 2,
      hitFlash: 0,
      angle: Math.PI / 2,
      patternSeed: Math.random() * 100,
    });
  }

  public triggerDash(): void {
    if (this.gameState !== 'PLAYING') return;
    if (this.player.dashCooldown > 0 || this.player.dashActiveTimer > 0) return;

    let dx = 0;
    let dy = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;

    if (dx === 0 && dy === 0) {
      dx = Math.cos(this.player.aimAngle);
      dy = Math.sin(this.player.aimAngle);
    } else {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    this.player.dashDirX = dx;
    this.player.dashDirY = dy;
    this.player.dashActiveTimer = 0.16;
    this.player.dashCooldown = this.player.dashMaxCooldown;
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.24);
    this.sound.playDash();

    this.shockwaves.push({
      x: this.player.x,
      y: this.player.y,
      radius: 10,
      maxRadius: 58,
      color: '#22d3ee',
      alpha: 0.75,
      lineWidth: 2.5,
    });
  }

  public triggerNova(): void {
    if (this.gameState !== 'PLAYING') return;
    if (this.player.novaCharge < 100) return;

    this.player.novaCharge = 0;
    this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.8);
    this.screenShake = Math.max(this.screenShake, 14);
    this.gridPulse = 1.0;
    this.sound.playNova();

    this.shockwaves.push({
      x: this.player.x,
      y: this.player.y,
      radius: 18,
      maxRadius: Math.max(this.width, this.height) * 0.72,
      color: '#38bdf8',
      alpha: 0.95,
      lineWidth: 5,
    });
    this.shockwaves.push({
      x: this.player.x,
      y: this.player.y,
      radius: 12,
      maxRadius: Math.max(this.width, this.height) * 0.55,
      color: '#f472b6',
      alpha: 0.85,
      lineWidth: 3,
    });

    // Clear all enemy projectiles
    for (const p of this.projectiles) {
      if (p.isEnemy) {
        this.spawnBurst(p.x, p.y, '#38bdf8', 4, 90);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.isEnemy);

    // Blast all active enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dmg = e.type === 'BOSS' ? 140 : 120;
      e.hp -= dmg;
      e.hitFlash = 0.18;
      this.spawnBurst(e.x, e.y, '#38bdf8', 10, 180);
      if (e.hp <= 0) {
        this.destroyEnemy(i);
      }
    }

    this.addFloatingText(this.player.x, this.player.y - 34, 'PULSO NOVA!', '#38bdf8', 1.25);
    this.emitHud();
  }

  private update(dt: number): void {
    this.globalTime += dt;
    this.updateStarfield(dt);
    this.updateParticles(dt);
    this.updateShockwaves(dt);
    this.updateFloatingTexts(dt);

    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 36);
    }
    if (this.gridPulse > 0) {
      this.gridPulse = Math.max(0, this.gridPulse - dt * 1.1);
    }
    if (this.waveBannerTimer > 0) {
      this.waveBannerTimer -= dt;
      if (this.waveBannerTimer <= 0) {
        this.waveBanner = null;
      }
    }

    if (this.gameState !== 'PLAYING') {
      return;
    }

    // Combo decay
    if (this.combo > 1.0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1.0;
        this.comboTimer = 0;
      }
    }

    this.updatePlayer(dt);
    this.updateWaveDirector(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.updatePowerUps(dt);

    this.hudSyncAccumulator += dt;
    if (this.hudSyncAccumulator >= 0.06) {
      this.hudSyncAccumulator = 0;
      this.emitHud();
    }
  }

  private updateStarfield(dt: number): void {
    const speedFactor = this.gameState === 'PLAYING' ? 1.0 : 0.45;
    for (const s of this.stars) {
      s.y += s.speed * speedFactor * dt;
      if (s.y > this.height + 4) {
        s.y = -4;
        s.x = Math.random() * this.width;
      }
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;

    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (p.overdriveTimer > 0) p.overdriveTimer = Math.max(0, p.overdriveTimer - dt);
    if (p.muzzleFlash > 0) p.muzzleFlash = Math.max(0, p.muzzleFlash - dt * 10);
    if (p.recoilOffset > 0) p.recoilOffset = Math.max(0, p.recoilOffset - dt * 28);

    // Update dash afterimages
    for (let i = p.afterimages.length - 1; i >= 0; i--) {
      p.afterimages[i].alpha -= dt * 4.5;
      if (p.afterimages[i].alpha <= 0) {
        p.afterimages.splice(i, 1);
      }
    }

    // Movement
    if (p.dashActiveTimer > 0) {
      p.dashActiveTimer -= dt;
      const dashSpeed = 980;
      p.vx = p.dashDirX * dashSpeed;
      p.vy = p.dashDirY * dashSpeed;
      p.afterimages.push({
        x: p.x,
        y: p.y,
        angle: p.aimAngle,
        alpha: 0.7,
        color: p.overdriveTimer > 0 ? '#facc15' : '#22d3ee',
      });
    } else {
      let moveX = 0;
      let moveY = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveY -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveY += 1;

      if (this.touchActive && this.touchTargetX !== null && this.touchTargetY !== null) {
        const tdx = this.touchTargetX - p.x;
        const tdy = this.touchTargetY - p.y;
        const dist = Math.hypot(tdx, tdy);
        if (dist > 8) {
          moveX = tdx / dist;
          moveY = tdy / dist;
        }
      }

      if (moveX !== 0 || moveY !== 0) {
        const len = Math.hypot(moveX, moveY);
        moveX /= len;
        moveY /= len;
      }

      const maxSpeed = p.overdriveTimer > 0 ? 450 : 390;
      const accel = 2600;
      const friction = 9.5;

      if (moveX !== 0 || moveY !== 0) {
        p.vx += moveX * accel * dt;
        p.vy += moveY * accel * dt;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed;
          p.vy = (p.vy / speed) * maxSpeed;
        }
      } else {
        p.vx -= p.vx * Math.min(1, friction * dt);
        p.vy -= p.vy * Math.min(1, friction * dt);
      }

      // Smooth banking tilt based on horizontal velocity
      const targetBank = clamp(p.vx / 420, -1, 1) * 0.35;
      p.bankTilt += (targetBank - p.bankTilt) * Math.min(1, dt * 14);
    }

    p.x = clamp(p.x + p.vx * dt, p.radius + 10, this.width - p.radius - 10);
    p.y = clamp(p.y + p.vy * dt, p.radius + 54, this.height - p.radius - 12);

    // Thruster exhaust particles
    if (Math.random() < 0.75) {
      const backAngle = p.aimAngle + Math.PI;
      const spread = (Math.random() - 0.5) * 0.45;
      const exhaustSpeed = 120 + Math.random() * 110;
      this.particles.push({
        x: p.x + Math.cos(backAngle) * 16 + (Math.random() - 0.5) * 6,
        y: p.y + Math.sin(backAngle) * 16 + (Math.random() - 0.5) * 6,
        vx: Math.cos(backAngle + spread) * exhaustSpeed,
        vy: Math.sin(backAngle + spread) * exhaustSpeed,
        size: 2.2 + Math.random() * 2.2,
        color: p.overdriveTimer > 0 ? '#facc15' : '#22d3ee',
        alpha: 0.85,
        life: 0.22,
        maxLife: 0.22,
        drag: 2.0,
        glow: true,
      });
    }

    // Fluid Aiming
    let targetAim = -Math.PI / 2;
    if (this.freeAim && this.mouseActive) {
      targetAim = Math.atan2(this.mouseY - p.y, this.mouseX - p.x);
    }
    p.aimAngle = lerpAngle(p.aimAngle, targetAim, Math.min(1, dt * 24));

    // Fluid Firing with sub-frame accumulator
    p.fireCooldown -= dt;
    const wantsToShoot =
      this.mouseDown ||
      this.keys.has('Space') ||
      this.keys.has('KeyJ') ||
      this.autoFire ||
      this.touchActive;

    if (wantsToShoot && p.fireCooldown <= 0) {
      const interval = this.getFireInterval();
      let safety = 0;
      while (p.fireCooldown <= 0 && safety < 3) {
        this.firePlayerWeapon();
        p.fireCooldown += interval;
        safety++;
      }
    } else if (p.fireCooldown < 0) {
      p.fireCooldown = 0;
    }
  }

  private getFireInterval(): number {
    const p = this.player;
    let base = 0.125;
    if (p.weapon === 'SPREAD') base = 0.21;
    if (p.weapon === 'PLASMA_HOMING') base = 0.22;
    if (p.overdriveTimer > 0) base *= 0.58;
    return base;
  }

  private firePlayerWeapon(): void {
    const p = this.player;
    const isOverdrive = p.overdriveTimer > 0;
    const angle = p.aimAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const perpX = -sin;
    const perpY = cos;

    p.muzzleFlash = 1.0;
    p.recoilOffset = 4.2;
    this.sound.playShoot(p.weapon, isOverdrive);

    const spawnBullet = (
      offsetSide: number,
      angleOffset: number,
      speed: number,
      damage: number,
      color: string,
      coreColor: string,
      radius: number,
      homing: boolean = false,
      pierce: number = 0
    ) => {
      const a = angle + angleOffset;
      const bx = p.x + cos * 18 + perpX * offsetSide;
      const by = p.y + sin * 18 + perpY * offsetSide;
      this.projectiles.push({
        id: this.nextEntityId++,
        x: bx,
        y: by,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        radius,
        damage: isOverdrive ? Math.round(damage * 1.25) : damage,
        color,
        coreColor,
        isEnemy: false,
        homing,
        pierce,
        life: 2.4,
        maxLife: 2.4,
        trail: [{ x: bx, y: by }],
      });
      this.shotsFired++;
    };

    if (p.weapon === 'PULSE') {
      const color = isOverdrive ? '#facc15' : '#22d3ee';
      const core = '#ffffff';
      const speed = 920;
      if (p.weaponLevel === 1) {
        spawnBullet(-8, 0, speed, 13, color, core, 4);
        spawnBullet(8, 0, speed, 13, color, core, 4);
      } else if (p.weaponLevel === 2) {
        spawnBullet(0, 0, speed + 60, 14, color, core, 4.5);
        spawnBullet(-12, -0.04, speed, 11, color, core, 3.8);
        spawnBullet(12, 0.04, speed, 11, color, core, 3.8);
      } else {
        spawnBullet(-6, 0, speed + 80, 14, color, core, 4.5);
        spawnBullet(6, 0, speed + 80, 14, color, core, 4.5);
        spawnBullet(-15, -0.07, speed, 11, '#38bdf8', core, 3.8);
        spawnBullet(15, 0.07, speed, 11, '#38bdf8', core, 3.8);
      }
      if (isOverdrive) {
        spawnBullet(-19, -0.13, speed, 10, '#fde047', core, 3.5);
        spawnBullet(19, 0.13, speed, 10, '#fde047', core, 3.5);
      }
    } else if (p.weapon === 'SPREAD') {
      const count = p.weaponLevel === 1 ? 3 : p.weaponLevel === 2 ? 5 : 7;
      const spreadTotal = p.weaponLevel === 1 ? 0.34 : p.weaponLevel === 2 ? 0.56 : 0.72;
      const pierce = p.weaponLevel >= 3 ? 1 : 0;
      const color = isOverdrive ? '#fde047' : '#34d399';
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1) - 0.5;
        spawnBullet(0, t * spreadTotal, 800, 13, color, '#ecfdf5', 4.5, false, pierce);
      }
    } else if (p.weapon === 'PLASMA_HOMING') {
      const count = p.weaponLevel === 1 ? 2 : p.weaponLevel === 2 ? 3 : 4;
      const color = isOverdrive ? '#facc15' : '#e879f9';
      for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * 0.24;
        spawnBullet((i - (count - 1) / 2) * 8, spread, 560, 19, color, '#fdf4ff', 5.5, true, 0);
      }
    }
  }

  private updateWaveDirector(dt: number): void {
    if (this.waveEnemiesRemainingToSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnWaveEnemy();
        const baseInterval = Math.max(0.32, 1.05 - this.wave * 0.045);
        this.spawnTimer = baseInterval + Math.random() * 0.35;
      }
    } else if (this.enemies.length === 0) {
      this.waveTransitionTimer += dt;
      if (this.waveTransitionTimer >= 1.2) {
        this.waveTransitionTimer = 0;
        this.startWave(this.wave + 1);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const b = this.projectiles[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Homing logic for player plasma missiles
      if (!b.isEnemy && b.homing && this.enemies.length > 0) {
        let nearest: Enemy | null = null;
        let minDist = Infinity;
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < minDist) {
            minDist = d;
            nearest = e;
          }
        }
        if (nearest && minDist < 540) {
          const desiredAngle = Math.atan2(nearest.y - b.y, nearest.x - b.x);
          const currentAngle = Math.atan2(b.vy, b.vx);
          const speed = Math.hypot(b.vx, b.vy);
          const nextAngle = lerpAngle(currentAngle, desiredAngle, Math.min(1, dt * 8.5));
          b.vx = Math.cos(nextAngle) * speed;
          b.vy = Math.sin(nextAngle) * speed;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > (b.homing ? 10 : 5)) {
        b.trail.shift();
      }

      // Out of bounds
      if (b.x < -50 || b.x > this.width + 50 || b.y < -50 || b.y > this.height + 50) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (b.isEnemy) {
        // Check player collision
        const p = this.player;
        const dist = Math.hypot(b.x - p.x, b.y - p.y);
        if (dist < b.radius + p.radius * 0.78) {
          this.projectiles.splice(i, 1);
          this.damagePlayer(b.damage);
        }
      } else {
        // Check enemy collisions
        let removed = false;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          const dist = Math.hypot(b.x - e.x, b.y - e.y);
          if (dist < b.radius + e.radius) {
            e.hp -= b.damage;
            e.hitFlash = 0.1;
            this.shotsHit++;
            this.spawnBurst(b.x, b.y, b.color, 5, 130);

            if (e.hp <= 0) {
              this.destroyEnemy(j);
            } else {
              this.sound.playHit();
            }

            if (b.pierce > 0) {
              b.pierce--;
            } else {
              this.projectiles.splice(i, 1);
              removed = true;
              break;
            }
          }
        }
        if (removed) continue;
      }
    }
  }

  private updateEnemies(dt: number): void {
    const cfg = DIFFICULTY_CONFIGS[this.difficulty];
    const p = this.player;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.phaseTimer += dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      if (e.type === 'SWARMER') {
        e.x += Math.sin(e.phaseTimer * 4.5 + e.patternSeed) * 145 * dt;
        e.y += e.speed * dt;
        e.x = clamp(e.x, e.radius + 8, this.width - e.radius - 8);
        e.angle = Math.PI / 2 + Math.cos(e.phaseTimer * 4.5 + e.patternSeed) * 0.4;
      } else if (e.type === 'DRONE') {
        const targetY = Math.min(this.height * 0.42, 120 + (e.patternSeed % 180));
        if (e.y < targetY) {
          e.y += e.speed * dt;
        } else {
          e.x += Math.sin(e.phaseTimer * 1.8 + e.patternSeed) * 95 * dt;
          e.y += 18 * dt;
        }
        e.x = clamp(e.x, e.radius + 16, this.width - e.radius - 16);
        e.angle = Math.atan2(p.y - e.y, p.x - e.x);

        e.fireTimer -= dt * cfg.enemyFireRateMult;
        if (e.fireTimer <= 0 && e.y > 20) {
          e.fireTimer = 1.65 + Math.random() * 0.7;
          this.spawnEnemyBullet(e.x, e.y, e.angle, 270, 14, '#c084fc');
        }
      } else if (e.type === 'INTERCEPTOR') {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        e.vx += (dx / dist) * 260 * dt;
        e.vy = Math.max(e.speed * 0.6, e.vy + (dy / dist) * 140 * dt);
        const vel = Math.hypot(e.vx, e.vy);
        if (vel > e.speed * 1.35) {
          e.vx = (e.vx / vel) * e.speed * 1.35;
          e.vy = (e.vy / vel) * e.speed * 1.35;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.angle = Math.atan2(e.vy, e.vx);

        e.fireTimer -= dt * cfg.enemyFireRateMult;
        if (e.fireTimer <= 0 && e.y > 20 && e.y < this.height * 0.72) {
          e.fireTimer = 1.35;
          const aim = Math.atan2(p.y - e.y, p.x - e.x);
          this.spawnEnemyBullet(e.x, e.y, aim - 0.12, 310, 12, '#fb923c');
          this.spawnEnemyBullet(e.x, e.y, aim + 0.12, 310, 12, '#fb923c');
        }
      } else if (e.type === 'TANK') {
        if (e.y < this.height * 0.28) {
          e.y += e.speed * dt;
        } else {
          e.x += Math.cos(e.phaseTimer * 0.9 + e.patternSeed) * 55 * dt;
          e.y += 12 * dt;
        }
        e.x = clamp(e.x, e.radius + 20, this.width - e.radius - 20);
        e.angle += dt * 0.9;

        e.fireTimer -= dt * cfg.enemyFireRateMult;
        if (e.fireTimer <= 0 && e.y > 30) {
          e.fireTimer = 2.1;
          const base = Math.atan2(p.y - e.y, p.x - e.x);
          for (let k = -2; k <= 2; k++) {
            this.spawnEnemyBullet(e.x, e.y, base + k * 0.24, 240, 16, '#fb7185');
          }
        }
      } else if (e.type === 'BOSS') {
        const hoverY = Math.min(135, this.height * 0.22);
        if (e.y < hoverY) {
          e.y += 75 * dt;
        } else {
          e.x += e.vx * dt;
          if (e.x < e.radius + 40) {
            e.x = e.radius + 40;
            e.vx = Math.abs(e.vx);
          } else if (e.x > this.width - e.radius - 40) {
            e.x = this.width - e.radius - 40;
            e.vx = -Math.abs(e.vx);
          }
        }
        e.angle = Math.PI / 2 + Math.sin(e.phaseTimer * 1.4) * 0.15;

        e.fireTimer -= dt * cfg.enemyFireRateMult;
        if (e.fireTimer <= 0 && e.y >= hoverY - 10) {
          const hpRatio = e.hp / e.maxHp;
          const patternCycle = Math.floor(e.phaseTimer / 3.5) % 3;

          if (patternCycle === 0) {
            // Radial spiral burst
            e.fireTimer = hpRatio < 0.5 ? 0.34 : 0.46;
            const arms = hpRatio < 0.5 ? 8 : 6;
            for (let k = 0; k < arms; k++) {
              const a = e.phaseTimer * 2.2 + (k * Math.PI * 2) / arms;
              this.spawnEnemyBullet(e.x, e.y, a, 250, 14, '#f43f5e');
            }
          } else if (patternCycle === 1) {
            // Aimed triple salvo
            e.fireTimer = hpRatio < 0.5 ? 0.55 : 0.72;
            const aim = Math.atan2(p.y - e.y, p.x - e.x);
            for (let k = -2; k <= 2; k++) {
              this.spawnEnemyBullet(e.x, e.y, aim + k * 0.15, 330, 16, '#fb923c');
            }
          } else {
            // Twin sweeping streams
            e.fireTimer = 0.22;
            const sweep = Math.PI / 2 + Math.sin(e.phaseTimer * 3.8) * 0.65;
            this.spawnEnemyBullet(e.x - 28, e.y + 18, sweep, 290, 14, '#e879f9');
            this.spawnEnemyBullet(e.x + 28, e.y + 18, sweep, 290, 14, '#e879f9');
          }
        }
      }

      // Remove non-bosses that drift past bottom
      if (e.type !== 'BOSS' && e.y > this.height + 50) {
        this.enemies.splice(i, 1);
        continue;
      }

      // Player body collision
      const distToPlayer = Math.hypot(e.x - p.x, e.y - p.y);
      if (distToPlayer < e.radius + p.radius * 0.85) {
        this.damagePlayer(e.type === 'BOSS' ? 30 : 22);
        if (e.type !== 'BOSS') {
          e.hp -= 50;
          if (e.hp <= 0) {
            this.destroyEnemy(i);
          }
        }
      }
    }
  }

  private spawnEnemyBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    color: string
  ): void {
    this.projectiles.push({
      id: this.nextEntityId++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 5,
      damage,
      color,
      coreColor: '#fff1f2',
      isEnemy: true,
      homing: false,
      pierce: 0,
      life: 5.5,
      maxLife: 5.5,
      trail: [{ x, y }],
    });
  }

  private destroyEnemy(index: number): void {
    const e = this.enemies[index];
    this.enemies.splice(index, 1);

    const isBoss = e.type === 'BOSS';
    this.sound.playExplosion(isBoss || e.type === 'TANK');
    this.screenShake = Math.max(this.screenShake, isBoss ? 18 : e.type === 'TANK' ? 8 : 4);

    // Particles & shockwave
    this.spawnBurst(e.x, e.y, e.color, isBoss ? 65 : 22, isBoss ? 340 : 210);
    this.spawnBurst(e.x, e.y, '#ffffff', isBoss ? 25 : 8, isBoss ? 240 : 140);
    if (isBoss || e.type === 'TANK') {
      this.shockwaves.push({
        x: e.x,
        y: e.y,
        radius: 12,
        maxRadius: isBoss ? 220 : 90,
        color: e.color,
        alpha: 0.9,
        lineWidth: isBoss ? 4 : 2.5,
      });
    }

    // Score & Combo
    this.kills++;
    this.combo = Math.min(8.0, Number((this.combo + 0.2).toFixed(1)));
    this.comboTimer = this.comboMaxTime;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    const cfg = DIFFICULTY_CONFIGS[this.difficulty];
    const points = Math.round(e.scoreValue * this.combo * cfg.scoreMult);
    this.score += points;

    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewRecord = true;
      saveRecords({ highScore: this.highScore, bestWave: this.bestWave });
    }

    // Charge Nova
    this.player.novaCharge = Math.min(100, this.player.novaCharge + (isBoss ? 50 : e.type === 'TANK' ? 14 : 6));

    this.addFloatingText(
      e.x,
      e.y - 10,
      `+${points}${this.combo >= 2 ? ` · x${this.combo.toFixed(1)}` : ''}`,
      isBoss ? '#facc15' : '#67e8f9',
      isBoss ? 1.35 : 1.0
    );

    // Drop PowerUp chance
    if (isBoss || Math.random() < (e.type === 'TANK' ? 0.45 : 0.14)) {
      this.spawnPowerUp(e.x, e.y);
    }
  }

  private spawnPowerUp(x: number, y: number): void {
    const roll = Math.random();
    let type: PowerUpType = 'SHIELD';
    if (roll < 0.28) type = 'SHIELD';
    else if (roll < 0.52) type = 'WEAPON_SPREAD';
    else if (roll < 0.74) type = 'WEAPON_PLASMA';
    else if (roll < 0.90) type = 'OVERDRIVE';
    else type = 'NOVA_CHARGE';

    this.powerUps.push({
      id: this.nextEntityId++,
      type,
      x: clamp(x, 35, this.width - 35),
      y,
      vy: 85,
      radius: 14,
      life: 11,
      pulse: 0,
    });
  }

  private updatePowerUps(dt: number): void {
    const p = this.player;
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.y += pu.vy * dt;
      pu.life -= dt;
      pu.pulse += dt * 5;

      // Slight magnetic pull when close
      const dist = Math.hypot(p.x - pu.x, p.y - pu.y);
      if (dist < 130) {
        pu.x += ((p.x - pu.x) / Math.max(1, dist)) * 220 * dt;
        pu.y += ((p.y - pu.y) / Math.max(1, dist)) * 220 * dt;
      }

      if (dist < pu.radius + p.radius + 4) {
        this.applyPowerUp(pu);
        this.powerUps.splice(i, 1);
        continue;
      }

      if (pu.life <= 0 || pu.y > this.height + 40) {
        this.powerUps.splice(i, 1);
      }
    }
  }

  private applyPowerUp(pu: PowerUp): void {
    const p = this.player;
    this.sound.playPowerUp();

    let label = '';
    let color = '#22d3ee';

    if (pu.type === 'SHIELD') {
      const heal = 30;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      label = `ESCUDO +${heal}`;
      color = '#34d399';
    } else if (pu.type === 'WEAPON_SPREAD') {
      if (p.weapon === 'SPREAD') {
        p.weaponLevel = Math.min(3, p.weaponLevel + 1);
        label = `DISPERSÃO NV.${p.weaponLevel}`;
      } else {
        p.weapon = 'SPREAD';
        p.weaponLevel = Math.max(1, p.weaponLevel);
        label = 'CANHÃO DISPERSÃO';
      }
      color = '#34d399';
    } else if (pu.type === 'WEAPON_PLASMA') {
      if (p.weapon === 'PLASMA_HOMING') {
        p.weaponLevel = Math.min(3, p.weaponLevel + 1);
        label = `PLASMA GUIADO NV.${p.weaponLevel}`;
      } else {
        p.weapon = 'PLASMA_HOMING';
        p.weaponLevel = Math.max(1, p.weaponLevel);
        label = 'PLASMA GUIADO';
      }
      color = '#e879f9';
    } else if (pu.type === 'OVERDRIVE') {
      p.overdriveTimer = 8.0;
      if (p.weapon === 'PULSE') {
        p.weaponLevel = Math.min(3, p.weaponLevel + 1);
      }
      label = 'SOBRECARGA 8s';
      color = '#facc15';
    } else if (pu.type === 'NOVA_CHARGE') {
      p.novaCharge = 100;
      label = 'NOVA PRONTA [E]';
      color = '#38bdf8';
    }

    this.spawnBurst(p.x, p.y, color, 16, 170);
    this.addFloatingText(p.x, p.y - 26, label, color, 1.15);
    this.emitHud();
  }

  public switchWeapon(weapon: WeaponType): void {
    if (this.gameState !== 'PLAYING') return;
    this.player.weapon = weapon;
    this.emitHud();
  }

  private damagePlayer(amount: number): void {
    const p = this.player;
    if (p.invulnTimer > 0) return;

    p.hp = Math.max(0, p.hp - amount);
    p.invulnTimer = 0.85;
    this.combo = 1.0;
    this.comboTimer = 0;
    this.screenShake = Math.max(this.screenShake, 12);
    this.sound.playPlayerHit();
    this.spawnBurst(p.x, p.y, '#fb7185', 22, 240);
    this.addFloatingText(p.x, p.y - 24, `-${amount}`, '#fb7185', 1.15);

    if (p.hp <= 0) {
      this.sound.playExplosion(true);
      this.spawnBurst(p.x, p.y, '#22d3ee', 55, 320);
      this.shockwaves.push({
        x: p.x,
        y: p.y,
        radius: 10,
        maxRadius: 190,
        color: '#f43f5e',
        alpha: 0.95,
        lineWidth: 4,
      });
      this.gameState = 'GAME_OVER';
    }

    this.emitHud();
  }

  private spawnBurst(x: number, y: number, color: string, count: number, maxSpeed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 30 + Math.random() * maxSpeed;
      const life = 0.25 + Math.random() * 0.4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: 1.8 + Math.random() * 2.8,
        color,
        alpha: 1,
        life,
        maxLife: life,
        drag: 2.8,
        glow: true,
      });
    }
  }

  private addFloatingText(x: number, y: number, text: string, color: string, scale: number = 1): void {
    this.floatingTexts.push({
      x,
      y,
      vy: -42,
      text,
      color,
      alpha: 1,
      life: 0.9,
      maxLife: 0.9,
      scale,
    });
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-pt.drag * dt);
      pt.vx *= damp;
      pt.vy *= damp;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.alpha = pt.life / pt.maxLife;
    }
  }

  private updateShockwaves(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += (sw.maxRadius - sw.radius) * Math.min(1, dt * 8.5) + 80 * dt;
      sw.alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
      if (sw.radius >= sw.maxRadius || sw.alpha <= 0.02) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  private updateFloatingTexts(dt: number): void {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
      ft.alpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Deep space background
    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle ambient nebula glow
    const neb1 = ctx.createRadialGradient(
      this.width * 0.25,
      this.height * 0.3,
      20,
      this.width * 0.25,
      this.height * 0.3,
      this.width * 0.5
    );
    neb1.addColorStop(0, 'rgba(6, 182, 212, 0.06)');
    neb1.addColorStop(1, 'rgba(5, 7, 14, 0)');
    ctx.fillStyle = neb1;
    ctx.fillRect(0, 0, this.width, this.height);

    const neb2 = ctx.createRadialGradient(
      this.width * 0.78,
      this.height * 0.7,
      20,
      this.width * 0.78,
      this.height * 0.7,
      this.width * 0.45
    );
    neb2.addColorStop(0, 'rgba(168, 85, 247, 0.055)');
    neb2.addColorStop(1, 'rgba(5, 7, 14, 0)');
    ctx.fillStyle = neb2;
    ctx.fillRect(0, 0, this.width, this.height);

    // Apply screen shake
    if (this.screenShake > 0.2) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    // Subtle tactical horizon grid
    this.renderTacticalGrid(ctx);

    // Stars
    for (const s of this.stars) {
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.tint;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Additive neon layer for shockwaves, particles, projectiles
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Shockwaves
    for (const sw of this.shockwaves) {
      ctx.globalAlpha = sw.alpha;
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.lineWidth;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particles
    for (const pt of this.particles) {
      ctx.globalAlpha = pt.alpha;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Projectiles with glowing motion trails
    for (const b of this.projectiles) {
      if (b.trail.length > 1) {
        for (let t = 0; t < b.trail.length - 1; t++) {
          const ratio = (t + 1) / b.trail.length;
          ctx.globalAlpha = ratio * 0.55;
          ctx.strokeStyle = b.color;
          ctx.lineWidth = b.radius * 1.35 * ratio;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(b.trail[t].x, b.trail[t].y);
          ctx.lineTo(b.trail[t + 1].x, b.trail[t + 1].y);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 0.4;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 2.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = b.coreColor;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // PowerUps
    this.renderPowerUps(ctx);

    // Enemies
    this.renderEnemies(ctx);

    // Player & Afterimages
    if (this.gameState === 'PLAYING' || this.gameState === 'PAUSED') {
      this.renderPlayer(ctx);
      if (this.freeAim && this.mouseActive && this.gameState === 'PLAYING') {
        this.renderReticle(ctx);
      }
    }

    // Floating combat text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of this.floatingTexts) {
      ctx.globalAlpha = ft.alpha;
      ctx.font = `700 ${Math.round(14 * ft.scale)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  private renderTacticalGrid(ctx: CanvasRenderingContext2D): void {
    const baseAlpha = 0.035 + this.gridPulse * 0.08;
    ctx.strokeStyle = `rgba(34, 211, 238, ${baseAlpha})`;
    ctx.lineWidth = 1;
    const step = 64;
    const offsetY = (this.globalTime * 36) % step;

    ctx.beginPath();
    for (let x = 0; x < this.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let y = offsetY; y < this.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
  }

  private renderPowerUps(ctx: CanvasRenderingContext2D): void {
    for (const pu of this.powerUps) {
      let color = '#34d399';
      let glyph = '+';
      if (pu.type === 'WEAPON_SPREAD') {
        color = '#34d399';
        glyph = 'W';
      } else if (pu.type === 'WEAPON_PLASMA') {
        color = '#e879f9';
        glyph = 'P';
      } else if (pu.type === 'OVERDRIVE') {
        color = '#facc15';
        glyph = '⚡';
      } else if (pu.type === 'NOVA_CHARGE') {
        color = '#38bdf8';
        glyph = 'N';
      }

      const scale = 1 + Math.sin(pu.pulse) * 0.12;
      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.scale(scale, scale);

      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(5, 7, 14, 0.85)';

      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + pu.pulse * 0.12;
        const px = Math.cos(a) * pu.radius;
        const py = Math.sin(a) * pu.radius;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, 0, 1);

      ctx.restore();
    }
  }

  private renderEnemies(ctx: CanvasRenderingContext2D): void {
    for (const e of this.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);

      const stroke = e.hitFlash > 0 ? '#ffffff' : e.color;
      ctx.shadowColor = stroke;
      ctx.shadowBlur = e.type === 'BOSS' ? 22 : 12;
      ctx.strokeStyle = stroke;
      ctx.fillStyle = e.hitFlash > 0 ? 'rgba(255,255,255,0.45)' : 'rgba(9, 12, 24, 0.9)';
      ctx.lineWidth = e.type === 'BOSS' ? 3 : 2;

      if (e.type === 'SWARMER') {
        ctx.rotate(e.angle);
        ctx.beginPath();
        ctx.moveTo(e.radius, 0);
        ctx.lineTo(-e.radius * 0.85, -e.radius * 0.75);
        ctx.lineTo(-e.radius * 0.4, 0);
        ctx.lineTo(-e.radius * 0.85, e.radius * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'DRONE') {
        ctx.rotate(e.angle);
        ctx.beginPath();
        ctx.moveTo(e.radius, 0);
        ctx.lineTo(0, -e.radius * 0.85);
        ctx.lineTo(-e.radius, 0);
        ctx.lineTo(0, e.radius * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
      } else if (e.type === 'INTERCEPTOR') {
        ctx.rotate(e.angle);
        ctx.beginPath();
        ctx.moveTo(e.radius * 1.15, 0);
        ctx.lineTo(-e.radius * 0.5, -e.radius);
        ctx.lineTo(-e.radius * 0.9, -e.radius * 0.35);
        ctx.lineTo(-e.radius * 0.9, e.radius * 0.35);
        ctx.lineTo(-e.radius * 0.5, e.radius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'TANK') {
        ctx.rotate(e.angle);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const px = Math.cos(a) * e.radius;
          const py = Math.sin(a) * e.radius;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.type === 'BOSS') {
        // Multi-wing Neon Dreadnought
        ctx.rotate(e.angle - Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, e.radius);
        ctx.lineTo(e.radius * 1.25, -e.radius * 0.15);
        ctx.lineTo(e.radius * 0.75, -e.radius * 0.85);
        ctx.lineTo(0, -e.radius * 0.5);
        ctx.lineTo(-e.radius * 0.75, -e.radius * 0.85);
        ctx.lineTo(-e.radius * 1.25, -e.radius * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Pulsing boss core
        const corePulse = 0.85 + Math.sin(this.globalTime * 8) * 0.15;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.36 * corePulse, 0, Math.PI * 2);
        ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#fb7185';
        ctx.fill();
      }

      // Small health bar for damaged Tanks
      if (e.type === 'TANK' && e.hp < e.maxHp) {
        ctx.restore();
        ctx.save();
        const bw = 38;
        const bh = 4;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 12, bw, bh);
        ctx.fillStyle = '#fb7185';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 12, bw * (e.hp / e.maxHp), bh);
      }

      ctx.restore();
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.player;

    // Render dash afterimages
    for (const ghost of p.afterimages) {
      ctx.save();
      ctx.translate(ghost.x, ghost.y);
      ctx.rotate(ghost.angle + Math.PI / 2);
      ctx.globalAlpha = ghost.alpha * 0.5;
      ctx.strokeStyle = ghost.color;
      ctx.lineWidth = 2;
      this.drawShipPath(ctx, p.radius);
      ctx.stroke();
      ctx.restore();
    }

    // Invulnerability blink
    if (p.invulnTimer > 0 && Math.floor(this.globalTime * 18) % 2 === 0 && p.dashActiveTimer <= 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
    } else {
      ctx.save();
    }

    const recoilX = -Math.cos(p.aimAngle) * p.recoilOffset;
    const recoilY = -Math.sin(p.aimAngle) * p.recoilOffset;

    ctx.translate(p.x + recoilX, p.y + recoilY);
    ctx.rotate(p.aimAngle + Math.PI / 2);
    ctx.scale(1 - Math.abs(p.bankTilt) * 0.22, 1);

    const primaryColor = p.overdriveTimer > 0 ? '#facc15' : '#22d3ee';
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 16;

    // Hull
    ctx.fillStyle = '#091020';
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.4;
    this.drawShipPath(ctx, p.radius);
    ctx.fill();
    ctx.stroke();

    // Inner cockpit core
    ctx.beginPath();
    ctx.moveTo(0, -p.radius * 0.45);
    ctx.lineTo(5, 4);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fillStyle = primaryColor;
    ctx.fill();

    // Muzzle flash
    if (p.muzzleFlash > 0.1) {
      ctx.globalAlpha = p.muzzleFlash;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -p.radius - 4, 6 * p.muzzleFlash, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Shield energy aura when invulnerable or low HP
    if (p.invulnTimer > 0) {
      ctx.save();
      ctx.strokeStyle = p.dashActiveTimer > 0 ? '#facc15' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawShipPath(ctx: CanvasRenderingContext2D, r: number): void {
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.25);
    ctx.lineTo(r * 0.95, r * 0.75);
    ctx.lineTo(r * 0.38, r * 0.48);
    ctx.lineTo(0, r * 0.9);
    ctx.lineTo(-r * 0.38, r * 0.48);
    ctx.lineTo(-r * 0.95, r * 0.75);
    ctx.closePath();
  }

  private renderReticle(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.mouseX, this.mouseY);
    ctx.strokeStyle = this.mouseDown ? '#facc15' : 'rgba(34, 211, 238, 0.85)';
    ctx.lineWidth = 1.6;

    const r = this.mouseDown ? 10 : 13;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair ticks
    ctx.beginPath();
    ctx.moveTo(-r - 5, 0);
    ctx.lineTo(-r + 3, 0);
    ctx.moveTo(r - 3, 0);
    ctx.lineTo(r + 5, 0);
    ctx.moveTo(0, -r - 5);
    ctx.lineTo(0, -r + 3);
    ctx.moveTo(0, r - 3);
    ctx.lineTo(0, r + 5);
    ctx.stroke();

    ctx.restore();
  }

  private emitHud(): void {
    const boss = this.enemies.find((e) => e.type === 'BOSS');
    this.onHudUpdate({
      gameState: this.gameState,
      score: this.score,
      highScore: this.highScore,
      bestWave: this.bestWave,
      wave: this.wave,
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      combo: this.combo,
      comboTimerRatio: this.combo > 1 ? this.comboTimer / this.comboMaxTime : 0,
      maxCombo: this.maxCombo,
      kills: this.kills,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      weapon: this.player.weapon,
      weaponLevel: this.player.weaponLevel,
      overdriveTimer: this.player.overdriveTimer,
      dashReadyRatio: 1 - this.player.dashCooldown / this.player.dashMaxCooldown,
      novaCharge: Math.floor(this.player.novaCharge),
      autoFire: this.autoFire,
      bossActive: Boolean(boss),
      bossHpRatio: boss ? Math.max(0, boss.hp / boss.maxHp) : 0,
      bossName: boss ? `DREADNOUGHT MK-${Math.max(1, Math.floor(this.wave / 5))}` : '',
      waveBanner: this.waveBanner,
      isNewRecord: this.isNewRecord,
    });
  }

  // Input listeners
  private handleKeyDown = (e: KeyboardEvent) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    this.keys.add(e.code);

    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') {
      this.triggerDash();
    } else if (e.code === 'KeyE' || e.code === 'KeyQ') {
      this.triggerNova();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.gameState === 'PLAYING' || this.gameState === 'PAUSED') {
        this.togglePause();
      }
    } else if (e.code === 'KeyF') {
      this.toggleAutoFire();
    } else if (e.code === 'KeyM') {
      this.toggleFreeAim();
    } else if (e.code === 'Digit1') {
      this.switchWeapon('PULSE');
    } else if (e.code === 'Digit2') {
      this.switchWeapon('SPREAD');
    } else if (e.code === 'Digit3') {
      this.switchWeapon('PLASMA_HOMING');
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private handleMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    this.mouseActive = true;
  };

  private handleMouseDown = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    this.mouseActive = true;

    if (e.button === 0) {
      this.mouseDown = true;
    } else if (e.button === 2) {
      this.triggerDash();
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseDown = false;
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (this.gameState !== 'PLAYING') return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    if (touch) {
      this.touchActive = true;
      this.touchTargetX = touch.clientX - rect.left;
      this.touchTargetY = touch.clientY - rect.top - 48;
      this.mouseActive = false;
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (this.gameState !== 'PLAYING') return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    if (touch) {
      this.touchTargetX = touch.clientX - rect.left;
      this.touchTargetY = touch.clientY - rect.top - 48;
    }
  };

  private handleTouchEnd = () => {
    this.touchActive = false;
    this.touchTargetX = null;
    this.touchTargetY = null;
  };

  private handleBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.touchActive = false;
  };

  private attachInputListeners(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    window.addEventListener('touchend', this.handleTouchEnd);
  }

  private detachInputListeners(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('touchend', this.handleTouchEnd);
  }
}
