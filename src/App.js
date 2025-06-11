import React, { useRef, useEffect, useState } from 'react';
import Matter from 'matter-js';

const MAX_WORDS = 100;
const CIRCLE_RADIUS = 250;
const STAGE_SIZE = 600;

function randomPositionInCircle(radius) {
  const t = 2 * Math.PI * Math.random();
  const r = radius * Math.sqrt(Math.random());
  return {
    x: STAGE_SIZE / 2 + r * Math.cos(t),
    y: STAGE_SIZE / 2 + r * Math.sin(t),
  };
}

function App() {
  const sceneRef = useRef();
  const [words, setWords] = useState([]);
  const [input, setInput] = useState('');
  const [particles, setParticles] = useState([]); // パーティクル演出用
  const [pressing, setPressing] = useState({}); // { [word]: {start: timestamp, progress: 0~1, timerId} }
  const [isLocked, setIsLocked] = useState(false); // 全削除演出中ロック
  const engineRef = useRef();
  const [_, setTick] = useState(0);

  // Matter.js setup
  useEffect(() => {
    const Engine = Matter.Engine,
      Render = Matter.Render,
      World = Matter.World,
      Bodies = Matter.Bodies,
      Body = Matter.Body,
      Events = Matter.Events;

    const engine = Engine.create();
    engineRef.current = engine;

    // 円周上に多数の静的な壁を配置して外に出られないようにする
    const wallCount = 40;
    const walls = [];
    for (let i = 0; i < wallCount; i++) {
      const angle = (2 * Math.PI * i) / wallCount;
      const x = STAGE_SIZE / 2 + (CIRCLE_RADIUS + 8) * Math.cos(angle);
      const y = STAGE_SIZE / 2 + (CIRCLE_RADIUS + 8) * Math.sin(angle);
      // 薄い長方形の壁を円周上に配置
      const wall = Bodies.rectangle(x, y, 16, 40, {
        isStatic: true,
        angle: angle,
        render: { visible: false },
        collisionFilter: { category: 0x0002 }
      });
      walls.push(wall);
    }
    World.add(engine.world, walls);

    // Animation loop
    (function run() {
      Engine.update(engine, 1000 / 60);
      setTick(t => t + 1); // force rerender
      requestAnimationFrame(run);
    })();

    return () => {
      World.clear(engine.world);
      Engine.clear(engine);
    };
  }, []);

  // Add new word as a Matter body
  useEffect(() => {
    if (!engineRef.current) return;
    const engine = engineRef.current;
    // Remove all word bodies
    Matter.Composite.allBodies(engine.world).forEach(body => {
      if (body.label.startsWith('word:')) {
        Matter.World.remove(engine.world, body);
      }
    });
    // Add current words
    words.forEach((word, idx) => {
      const pos = randomPositionInCircle(CIRCLE_RADIUS - 40);
      const body = Matter.Bodies.circle(pos.x, pos.y, 32, {
        label: `word:${word}`,
        restitution: 0.9,
        frictionAir: 0.02,
        render: { visible: false }
      });
      // ランダムな速度で漂う
      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
      });
      Matter.World.add(engine.world, body);
    });
  }, [words]);

  // 文字追加
  const handleAdd = (e) => {
    e.preventDefault();
    if (!input.trim() || words.length >= MAX_WORDS) return;
    setWords([...words, input.trim()]);
    setInput('');
  };

  // クリックで消去
  const handleCanvasClick = (e) => {
    const rect = sceneRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const engine = engineRef.current;
    const bodies = Matter.Composite.allBodies(engine.world);
    for (let body of bodies) {
      if (body.label.startsWith('word:')) {
        const dx = body.position.x - x;
        const dy = body.position.y - y;
        if (dx * dx + dy * dy < 32 * 32) {
          const word = body.label.slice(5);
          // クリック位置のbody座標取得
          const bx = body.position.x;
          const by = body.position.y;
          // 文字は即消去
          setWords(ws => ws.filter(w => w !== word));
          // パーティクル生成
          const PARTICLE_COUNT = 10;
          const newParticles = [];
          for (let i = 0; i < PARTICLE_COUNT; i++) {
            const angle = (2 * Math.PI * i) / PARTICLE_COUNT + Math.random() * 0.12;
            const dist = 60 + Math.random() * 10;
            newParticles.push({
              id: `${word}_${Date.now()}_${i}`,
              x: bx,
              y: by,
              angle,
              dist,
              start: Date.now(),
              duration: 400 + Math.random() * 120
            });
          }
          setParticles(ps => [...ps, ...newParticles]);
          break;
        }
      }
    }
  };

  // パーティクル自動消去
  useEffect(() => {
    if (!particles.length) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setParticles(ps => ps.filter(p => now - p.start < p.duration));
    }, 80);
    return () => clearInterval(timer);
  }, [particles]);


  // 描画
  const engine = engineRef.current;
  let bodies = [];
  if (engine) {
    bodies = Matter.Composite.allBodies(engine.world).filter(b => b.label.startsWith('word:'));
  }

  return (
    <div style={{ textAlign: 'center', marginTop: 30 }}>
      <h2>脳内マップ</h2>
      <form onSubmit={handleAdd}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          maxLength={12}
          placeholder="文字を入力"
          style={{ fontSize: 18, width: 180 }}
          disabled={isLocked}
        />
        <button type="submit" disabled={words.length >= MAX_WORDS || isLocked}>登録</button>
      </form>
      <div
        ref={sceneRef}
        onClick={handleCanvasClick}
        style={{
          margin: '30px auto',
          width: STAGE_SIZE,
          height: STAGE_SIZE,
          background: '#f7f7fa',
          borderRadius: '50%',
          border: '4px solid #ccc',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 0 10px #bbb',
        }}
      >
        {bodies.map((body, idx) => {
          const word = body.label.slice(5);
          const press = pressing[word] || { progress: 0 };
          // 色補間: progress=0で白、progress=1で赤
          const r = Math.round(255 * (1 - press.progress) + 255 * press.progress);
          const g = Math.round(255 * (1 - press.progress));
          const b = Math.round(255 * (1 - press.progress));
          const bgColor = `rgb(${r},${g},${b})`;
          return (
            <div
              key={word + '_' + idx}
              style={{
                position: 'absolute',
                left: body.position.x - 32,
                top: body.position.y - 32,
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: bgColor,
                border: '2px solid #888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 'bold',
                color: '#444',
                boxShadow: '0 2px 8px #aaa',
                userSelect: 'none',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                pointerEvents: isLocked ? 'none' : 'auto',
              }}
              onMouseDown={() => {
                if (pressing[word] || isLocked) return;
                const start = Date.now();
                let reachedMax = false;
                const timerId = setInterval(() => {
                  const now = Date.now();
                  const progress = Math.min(1, (now - start) / 1000);
                  setPressing(p => ({ ...p, [word]: { start, progress, timerId } }));
                  if (progress >= 1 && !reachedMax) {
                    reachedMax = true;
                    clearInterval(timerId);
                    // --- 長押し最大時の同一文字全削除演出 ---
                    setIsLocked(true);
                    const sameBodies = Matter.Composite.allBodies(engineRef.current.world)
                      .filter(b => b.label === body.label);
                    // まず全削除
                    setWords(ws => ws.filter(w => w !== word));
                    // パーティクル演出のみ0.1秒ずつずらして発動
                    sameBodies.forEach((b, i) => {
                      setTimeout(() => {
                        const PARTICLE_COUNT = 10;
                        const newParticles = [];
                        for (let j = 0; j < PARTICLE_COUNT; j++) {
                          const angle = (2 * Math.PI * j) / PARTICLE_COUNT + Math.random() * 0.12;
                          const dist = 60 + Math.random() * 10;
                          newParticles.push({
                            id: `${word}_${Date.now()}_${i}_${j}`,
                            x: b.position.x,
                            y: b.position.y,
                            angle,
                            dist,
                            start: Date.now(),
                            duration: 400 + Math.random() * 120
                          });
                        }
                        setParticles(ps => [...ps, ...newParticles]);
                      }, i * 100);
                    });
                    setTimeout(() => {
                      setPressing(p => { const cp = { ...p }; delete cp[word]; return cp; });
                      setIsLocked(false);
                    }, sameBodies.length * 100 + 300);
                  }
                }, 30);
                setPressing(p => ({ ...p, [word]: { start, progress: 0, timerId, reachedMax: false } }));
              }}
              onMouseUp={() => {
                if (pressing[word]) {
                  clearInterval(pressing[word].timerId);
                  // 進行度が1未満なら単体削除
                  if ((pressing[word].progress || 0) < 1 && !isLocked) {
                    // パーティクル演出（単体）
                    const body = bodies[idx];
                    const PARTICLE_COUNT = 10;
                    const newParticles = [];
                    for (let j = 0; j < PARTICLE_COUNT; j++) {
                      const angle = (2 * Math.PI * j) / PARTICLE_COUNT + Math.random() * 0.12;
                      const dist = 60 + Math.random() * 10;
                      newParticles.push({
                        id: `${word}_${Date.now()}_${idx}_${j}`,
                        x: body.position.x,
                        y: body.position.y,
                        angle,
                        dist,
                        start: Date.now(),
                        duration: 400 + Math.random() * 120
                      });
                    }
                    setParticles(ps => [...ps, ...newParticles]);
                    setWords(ws => {
                      let removed = false;
                      return ws.filter((w, i2) => {
                        if (!removed && w === word && i2 === idx) {
                          removed = true;
                          return false;
                        }
                        return true;
                      });
                    });
                  }
                  setPressing(p => { const cp = { ...p }; delete cp[word]; return cp; });
                }
              }}
              onMouseLeave={() => {
                if (pressing[word]) {
                  clearInterval(pressing[word].timerId);
                  setPressing(p => { const cp = { ...p }; delete cp[word]; return cp; });
                }
              }}
            >
              {word}
            </div>
          );
        })}
        {/* パーティクル演出 */}
        {particles.map(p => {
          // 進行度 [0,1]
          const progress = Math.min(1, (Date.now() - p.start) / p.duration);
          const tx = Math.cos(p.angle) * p.dist * progress;
          const ty = Math.sin(p.angle) * p.dist * progress;
          const scale = 1 - progress * 0.7;
          return (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: p.x - 8 + tx,
                top: p.y - 8 + ty,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#ffb347',
                border: '2px solid #ff9800',
                boxShadow: '0 1px 4px #e8b26c',
                pointerEvents: 'none',
                transform: `scale(${scale})`,
                transition: 'none',
                zIndex: 200,
              }}
            />
          );
        })}
      </div>
      <div>登録数: {words.length} / {MAX_WORDS}</div>
      <div style={{marginTop:20, color:'#888'}}>※ 共有リンク機能は後日追加予定</div>
    </div>
  );
}

export default App;
