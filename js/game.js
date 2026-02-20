/**
 * STAR SHOOTER – Game Engine
 * Canvas-based space shooter with Firebase save on game over.
 */

import { auth } from './firebase-config.js';
import { saveScore, getBestScore } from './db.js';
import { renderLeaderboard } from './leaderboard.js';
import { signOut } from './auth.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 600, H = 800;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 10;
const ENEMY_BASE_SPD = 1.2;
const FIRE_COOLDOWN = 180; // ms
const ENEMY_BULLET_SPD = 3.5;

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
    phase: 'start',   // 'start' | 'playing' | 'paused' | 'levelup' | 'gameover'
    score: 0,
    level: 1,
    lives: 3,
    bestScore: 0,
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    particles: [],
    stars: [],
    keys: {},
    lastFire: 0,
    lastEnemyFire: 0,
    enemyFireCooldown: 2200,
    frameId: null,
    lastTime: 0,
};

let currentUser = null;

// ─── DOM References ───────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hudScore = document.getElementById('hud-score');
const hudLives = document.getElementById('hud-lives');
const hudLevel = document.getElementById('hud-level');
const hudBest = document.getElementById('hud-best');
const hudUser = document.getElementById('hud-user');

const startOverlay = document.getElementById('overlay-start');
const pauseOverlay = document.getElementById('overlay-pause');
const gameoverOverlay = document.getElementById('overlay-gameover');
const levelupOverlay = document.getElementById('overlay-levelup');

canvas.width = W;
canvas.height = H;

// ─── Auth Guard ───────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = user;
    hudUser.textContent = user.displayName || user.email || 'Pilot';

    const data = await getBestScore(user.uid);
    state.bestScore = data?.bestScore ?? 0;
    hudBest.textContent = state.bestScore.toLocaleString();
});

// ─── Input ────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    state.keys[e.code] = true;
    if (e.code === 'Space') {
        e.preventDefault();
        if (state.phase === 'playing') tryFire();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
document.addEventListener('keyup', e => { state.keys[e.code] = false; });

// Mobile controls
function bindMobile() {
    const map = {
        'mb-left': () => { state.keys['ArrowLeft'] = true; },
        'mb-right': () => { state.keys['ArrowRight'] = true; },
        'mb-up': () => { state.keys['ArrowUp'] = true; },
        'mb-down': () => { state.keys['ArrowDown'] = true; },
    };
    const unmap = {
        'mb-left': () => { state.keys['ArrowLeft'] = false; },
        'mb-right': () => { state.keys['ArrowRight'] = false; },
        'mb-up': () => { state.keys['ArrowUp'] = false; },
        'mb-down': () => { state.keys['ArrowDown'] = false; },
    };
    for (const [id, fn] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
        el.addEventListener('touchend', e => { e.preventDefault(); unmap[id](); }, { passive: false });
        el.addEventListener('mousedown', e => { fn(); });
        el.addEventListener('mouseup', e => { unmap[id](); });
    }
    const fireBtn = document.getElementById('btn-fire');
    if (fireBtn) {
        fireBtn.addEventListener('touchstart', e => { e.preventDefault(); if (state.phase === 'playing') tryFire(); }, { passive: false });
        fireBtn.addEventListener('mousedown', () => { if (state.phase === 'playing') tryFire(); });
    }
}
bindMobile();

// ─── Button wiring ────────────────────────────────────────────────────────────
document.getElementById('btn-start-game')?.addEventListener('click', startGame);
document.getElementById('btn-resume')?.addEventListener('click', togglePause);
document.getElementById('btn-quit')?.addEventListener('click', () => window.location.href = 'index.html');
document.getElementById('btn-restart')?.addEventListener('click', startGame);
document.getElementById('btn-menu')?.addEventListener('click', () => window.location.href = 'index.html');
document.getElementById('btn-next-level')?.addEventListener('click', startLevel);
document.getElementById('btn-pause')?.addEventListener('click', togglePause);
document.getElementById('btn-signout')?.addEventListener('click', async () => {
    await signOut();
    window.location.href = 'index.html';
});

// ─── Star background ──────────────────────────────────────────────────────────
function initStars() {
    state.stars = Array.from({ length: 150 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.6 + 0.2,
        opacity: Math.random() * 0.7 + 0.2,
    }));
}

function drawStars() {
    ctx.save();
    state.stars.forEach(s => {
        s.y += s.speed;
        if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        ctx.globalAlpha = s.opacity;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

// ─── Entities ─────────────────────────────────────────────────────────────────
function makePlayer() {
    return { x: W / 2, y: H - 100, w: 40, h: 48, invincible: 0, trail: [] };
}

function spawnEnemyWave() {
    state.enemies = [];
    const cols = Math.min(3 + state.level, 8);
    const rows = Math.min(1 + Math.floor(state.level / 2), 4);
    const types = ['basic', 'zigzag', 'dive'];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const type = types[Math.min(Math.floor(state.level / 2), types.length - 1)];
            state.enemies.push({
                x: (W / (cols + 1)) * (c + 1),
                y: 60 + r * 70,
                w: 36, h: 36,
                hp: 1 + Math.floor(state.level / 3),
                maxHp: 1 + Math.floor(state.level / 3),
                type,
                dir: 1,
                angle: 0,
                startX: (W / (cols + 1)) * (c + 1),
                startY: 60 + r * 70,
                t: Math.random() * Math.PI * 2,
                color: `hsl(${Math.floor(Math.random() * 60 + 280)}, 70%, 60%)`,
            });
        }
    }
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawPlayer(p) {
    const inv = p.invincible > 0;
    if (inv && Math.floor(Date.now() / 80) % 2 === 0) return;

    // Trail
    p.trail.push({ x: p.x, y: p.y + p.h / 2, a: 0.5 });
    if (p.trail.length > 12) p.trail.shift();
    p.trail.forEach((t, i) => {
        ctx.globalAlpha = (i / p.trail.length) * 0.3;
        ctx.fillStyle = '#4f9cff';
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 4, 6, 10 * (i / p.trail.length), 0, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Engine glow
    const grad = ctx.createRadialGradient(p.x, p.y + p.h / 2 + 6, 0, p.x, p.y + p.h / 2 + 6, 24);
    grad.addColorStop(0, 'rgba(79,156,255,0.8)');
    grad.addColorStop(1, 'rgba(79,156,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.h / 2 + 6, 12, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ship body
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#c0d8ff';
    ctx.strokeStyle = '#4f9cff';
    ctx.lineWidth = 1.5;

    // Main fuselage
    ctx.beginPath();
    ctx.moveTo(0, -p.h / 2);
    ctx.lineTo(14, p.h / 2 - 8);
    ctx.lineTo(6, p.h / 2);
    ctx.lineTo(-6, p.h / 2);
    ctx.lineTo(-14, p.h / 2 - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.ellipse(0, -4, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Left wing
    ctx.fillStyle = '#7eb8ff';
    ctx.beginPath();
    ctx.moveTo(-14, p.h / 2 - 8);
    ctx.lineTo(-p.w / 2, p.h / 2 + 4);
    ctx.lineTo(-8, p.h / 2 - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(14, p.h / 2 - 8);
    ctx.lineTo(p.w / 2, p.h / 2 + 4);
    ctx.lineTo(8, p.h / 2 - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, e.w / 2 + 6);
    g.addColorStop(0, e.color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, e.w / 2 + 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = e.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;

    if (e.type === 'basic') {
        // Saucer
        ctx.beginPath();
        ctx.ellipse(0, 0, e.w / 2, e.h / 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(0, -4, e.w / 4, e.h / 5, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (e.type === 'zigzag') {
        // Sharp fighter
        ctx.beginPath();
        ctx.moveTo(0, -e.h / 2);
        ctx.lineTo(e.w / 2, e.h / 2);
        ctx.lineTo(0, e.h / 4);
        ctx.lineTo(-e.w / 2, e.h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else {
        // Heavy diver
        ctx.beginPath();
        ctx.moveTo(0, e.h / 2);
        ctx.lineTo(e.w / 2, -e.h / 2);
        ctx.lineTo(-e.w / 2, -e.h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Cannons
        ctx.fillStyle = 'rgba(255,255,200,0.7)';
        ctx.fillRect(-e.w / 2 - 4, e.h / 4 - 3, 8, 6);
        ctx.fillRect(e.w / 2 - 4, e.h / 4 - 3, 8, 6);
    }

    // HP bar
    if (e.maxHp > 1) {
        const bw = e.w;
        const pct = e.hp / e.maxHp;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(-bw / 2, -e.h / 2 - 8, bw, 4);
        ctx.fillStyle = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : '#ff4f6b';
        ctx.fillRect(-bw / 2, -e.h / 2 - 8, bw * pct, 4);
    }

    ctx.restore();
}

function drawBullet(b) {
    ctx.save();
    ctx.shadowColor = b.enemy ? '#ff4f6b' : '#4f9cff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = b.enemy ? '#ff4f6b' : '#fff';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.enemy ? 4 : 3, b.enemy ? 7 : 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawParticle(p) {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ─── Particles ────────────────────────────────────────────────────────────────
function explode(x, y, color = '#fbbf24', count = 16) {
    for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const spd = Math.random() * 3 + 1;
        state.particles.push({
            x, y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            r: Math.random() * 4 + 1,
            color,
            life: 40, maxLife: 40,
        });
    }
}

// ─── Collision ────────────────────────────────────────────────────────────────
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax - aw / 2 < bx + bw / 2 &&
        ax + aw / 2 > bx - bw / 2 &&
        ay - ah / 2 < by + bh / 2 &&
        ay + ah / 2 > by - bh / 2;
}

// ─── Shooting ─────────────────────────────────────────────────────────────────
function tryFire() {
    const now = Date.now();
    if (now - state.lastFire < FIRE_COOLDOWN) return;
    state.lastFire = now;
    const p = state.player;
    state.bullets.push({ x: p.x, y: p.y - p.h / 2, vy: -BULLET_SPEED, w: 6, h: 20 });
    if (state.level >= 5) {
        state.bullets.push({ x: p.x - 12, y: p.y - p.h / 4, vy: -BULLET_SPEED, w: 6, h: 14 });
        state.bullets.push({ x: p.x + 12, y: p.y - p.h / 4, vy: -BULLET_SPEED, w: 6, h: 14 });
    }
}

function enemyFire() {
    if (state.enemies.length === 0) return;
    const now = Date.now();
    if (now - state.lastEnemyFire < state.enemyFireCooldown) return;
    state.lastEnemyFire = now;
    // Random enemy fires
    const shooter = state.enemies[Math.floor(Math.random() * state.enemies.length)];
    state.enemyBullets.push({
        x: shooter.x, y: shooter.y + shooter.h / 2,
        vy: ENEMY_BULLET_SPD, w: 8, h: 14, enemy: true
    });
}

// ─── Game flow ────────────────────────────────────────────────────────────────
function setPhase(phase) {
    state.phase = phase;
    startOverlay.classList.toggle('hidden', phase !== 'start');
    pauseOverlay.classList.toggle('hidden', phase !== 'paused');
    gameoverOverlay.classList.toggle('hidden', phase !== 'gameover');
    levelupOverlay.classList.toggle('hidden', phase !== 'levelup');
}

function startGame() {
    state.score = 0;
    state.level = 1;
    state.lives = 3;
    state.bullets = [];
    state.enemyBullets = [];
    state.particles = [];
    state.player = makePlayer();
    initStars();
    spawnEnemyWave();
    updateHUD();
    setPhase('playing');
    if (!state.frameId) loop(performance.now());
}

function startLevel() {
    state.bullets = [];
    state.enemyBullets = [];
    state.particles = [];
    state.player = makePlayer();
    state.enemyFireCooldown = Math.max(600, 2200 - state.level * 100);
    spawnEnemyWave();
    setPhase('playing');
}

async function gameOver() {
    setPhase('gameover');
    document.getElementById('go-score').textContent = state.score.toLocaleString();
    document.getElementById('go-level').textContent = state.level;

    if (currentUser) {
        try {
            await saveScore(currentUser.uid, currentUser.displayName || currentUser.email, state.score, state.level);
            // Refresh best
            const data = await getBestScore(currentUser.uid);
            state.bestScore = data?.bestScore ?? state.bestScore;
            hudBest.textContent = state.bestScore.toLocaleString();
            document.getElementById('go-best').textContent = state.bestScore.toLocaleString();
        } catch (e) { console.warn('Save failed', e); }
        await renderLeaderboard(currentUser.uid);
    }
}

function levelUp() {
    state.level++;
    document.getElementById('lu-level').textContent = state.level;
    document.getElementById('lu-score').textContent = state.score.toLocaleString();
    setPhase('levelup');
}

function togglePause() {
    if (state.phase === 'playing') setPhase('paused');
    else if (state.phase === 'paused') setPhase('playing');
}

function updateHUD() {
    hudScore.textContent = state.score.toLocaleString();
    hudLives.textContent = '❤️'.repeat(Math.max(0, state.lives));
    hudLevel.textContent = state.level;
    hudBest.textContent = state.bestScore.toLocaleString();
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update(dt) {
    if (state.phase !== 'playing') return;
    const p = state.player;

    // Player movement
    const spd = PLAYER_SPEED;
    if (state.keys['ArrowLeft'] || state.keys['KeyA']) p.x = Math.max(p.w / 2, p.x - spd);
    if (state.keys['ArrowRight'] || state.keys['KeyD']) p.x = Math.min(W - p.w / 2, p.x + spd);
    if (state.keys['ArrowUp'] || state.keys['KeyW']) p.y = Math.max(p.h / 2, p.y - spd);
    if (state.keys['ArrowDown'] || state.keys['KeyS']) p.y = Math.min(H - p.h / 2, p.y + spd);

    if (p.invincible > 0) p.invincible -= dt;

    // Move player bullets
    state.bullets = state.bullets.filter(b => {
        b.y += b.vy;
        return b.y > -20;
    });

    // Move enemy bullets
    state.enemyBullets = state.enemyBullets.filter(b => {
        b.y += b.vy;
        return b.y < H + 20;
    });

    // Move enemies
    const spd2 = ENEMY_BASE_SPD + state.level * 0.15;
    let hitWall = false;
    state.enemies.forEach(e => {
        e.t += 0.03;
        if (e.type === 'zigzag') {
            e.x += Math.sin(e.t * 2) * spd2 * 1.5;
        } else if (e.type === 'dive') {
            e.y += 0.3;
            e.x += Math.sin(e.t) * spd2;
        } else {
            e.x += e.dir * spd2;
        }
        if (e.x > W - 30 || e.x < 30) hitWall = true;
    });

    if (hitWall) {
        state.enemies.forEach(e => {
            e.dir *= -1;
            e.y += 20;
        });
    }

    // Enemy fire
    enemyFire();

    // Bullet ↔ Enemy collisions
    state.bullets = state.bullets.filter(b => {
        let hit = false;
        state.enemies = state.enemies.map(e => {
            if (!hit && rectsOverlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)) {
                hit = true;
                e.hp--;
                if (e.hp <= 0) {
                    explode(e.x, e.y, e.color, 20);
                    const pts = 10 * state.level * (e.type === 'basic' ? 1 : e.type === 'zigzag' ? 2 : 3);
                    state.score += pts;
                    return null;
                }
                explode(e.x, e.y, '#fff', 5);
            }
            return e;
        }).filter(Boolean);
        return !hit;
    });

    // Enemy bullet ↔ Player
    if (p.invincible <= 0) {
        state.enemyBullets = state.enemyBullets.filter(b => {
            if (rectsOverlap(b.x, b.y, b.w, b.h, p.x, p.y, p.w - 8, p.h - 8)) {
                state.lives--;
                p.invincible = 2000;
                explode(p.x, p.y, '#ff4f6b', 12);
                if (state.lives <= 0) gameOver();
                return false;
            }
            return true;
        });

        // Enemy ↔ Player contact
        state.enemies.forEach(e => {
            if (rectsOverlap(e.x, e.y, e.w, e.h, p.x, p.y, p.w - 8, p.h - 8)) {
                state.lives--;
                p.invincible = 2000;
                explode(p.x, p.y, '#ff4f6b', 12);
                if (state.lives <= 0) gameOver();
            }
        });
    }

    // Particles
    state.particles.forEach(pt => {
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vx *= 0.92; pt.vy *= 0.92;
        pt.life--;
    });
    state.particles = state.particles.filter(pt => pt.life > 0);

    // Enemies reach bottom
    if (state.enemies.some(e => e.y > H - 40)) {
        state.lives--;
        explode(p.x, p.y, '#ff4f6b', 20);
        if (state.lives <= 0) { gameOver(); return; }
        spawnEnemyWave();
    }

    // All enemies cleared
    if (state.enemies.length === 0) levelUp();

    updateHUD();
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function draw() {
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#040818';
    ctx.fillRect(0, 0, W, H);
    drawStars();

    // Nebula blobs
    [
        { x: 0.2, y: 0.3, r1: '#1a0a3a', r2: 'transparent', sz: 200 },
        { x: 0.8, y: 0.7, r1: '#0a1a3a', r2: 'transparent', sz: 240 },
    ].forEach(n => {
        const g = ctx.createRadialGradient(W * n.x, H * n.y, 0, W * n.x, H * n.y, n.sz);
        g.addColorStop(0, n.r1);
        g.addColorStop(1, n.r2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    });

    state.enemies.forEach(drawEnemy);
    state.bullets.forEach(drawBullet);
    state.enemyBullets.forEach(drawBullet);
    state.particles.forEach(drawParticle);
    if (state.player) drawPlayer(state.player);
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
function loop(ts) {
    const dt = ts - state.lastTime;
    state.lastTime = ts;
    update(dt);
    draw();
    state.frameId = requestAnimationFrame(loop);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
initStars();
setPhase('start');
// Draw idle star field before game starts
(function idleLoop(ts) {
    if (state.phase === 'playing') return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#040818';
    ctx.fillRect(0, 0, W, H);
    drawStars();
    requestAnimationFrame(idleLoop);
})(0);

// Loop needs to be running when game starts, but only once
let loopStarted = false;
const origStart = startGame;
window.startGame = function () {
    origStart();
    if (!loopStarted) { loopStarted = true; state.frameId = requestAnimationFrame(loop); }
};
document.getElementById('btn-start-game')?.addEventListener('click', () => { });
