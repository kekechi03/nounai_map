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
  const [poppingWords, setPoppingWords] = useState([]); // 消滅アニメーション中の単語
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
          // すでにポップ中なら無視
          setPoppingWords(pw => pw.includes(word) ? pw : [...pw, word]);
          // アニメーション後に削除
          setTimeout(() => {
            setWords(ws => ws.filter(w => w !== word));
            setPoppingWords(pw => pw.filter(w => w !== word));
          }, 350); // 350msで消滅
          break;
        }
      }
    }
  };


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
        />
        <button type="submit" disabled={words.length >= MAX_WORDS}>登録</button>
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
          const popping = poppingWords.includes(word);
          return (
            <div
              key={word}
              style={{
                position: 'absolute',
                left: body.position.x - 32,
                top: body.position.y - 32,
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#fff',
                border: '2px solid #888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 'bold',
                color: '#444',
                boxShadow: '0 2px 8px #aaa',
                userSelect: 'none',
                cursor: popping ? 'default' : 'pointer',
                transition: popping ? 'transform 0.35s cubic-bezier(.6,1.5,.6,1), opacity 0.35s' : 'background 0.2s',
                transform: popping ? 'scale(1.7) rotate(' + (Math.random() * 40 - 20) + 'deg)' : 'scale(1)',
                opacity: popping ? 0 : 1,
                zIndex: popping ? 100 : 1,
                pointerEvents: popping ? 'none' : 'auto',
              }}
            >
              {word}
            </div>
          );
        })}
      </div>
      <div>登録数: {words.length} / {MAX_WORDS}</div>
      <div style={{marginTop:20, color:'#888'}}>※ 共有リンク機能は後日追加予定</div>
    </div>
  );
}

export default App;
