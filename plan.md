# Mudhole — Детальный план реализации

## Стек
- Server: Node.js + `ws` + `express` + `cors`
- Client: Vanilla HTML5 + Canvas API (без фреймворков)
- Сеть: ngrok для публичного доступа
- Графика: геометрические черви (Canvas 2D)
- Звуки: Web Audio API + freesound.org (CC0)

## Конфигурация
- MAX_PLAYERS: 15 (configurable)
- TEAM_COUNT: 2 (A vs B)
- Каждый игрок = один червяк
- Неравные команды: ОК, авто-балансировка HP
- WORM_HP: 100
- TURN_TIME: 30 секунд

## Архитектура

```
mudhole/
├── server/
│   ├── index.js           ← HTTP + WS сервер, ngrok detect
│   ├── GameRoom.js        ← Лобби + матч, команды, turn queue
│   ├── Physics.js         ← Гравитация, коллизии, fall damage
│   ├── Terrain.js         ← Генерация карт + разрушение + RLE
│   ├── Weapons.js         ← Логика всех 6 оружий
│   └── config.js          ← Все константы
├── client/
│   ├── index.html
│   ├── js/
│   │   ├── main.js        ← Роутер экранов
│   │   ├── screens/
│   │   │   ├── MainMenu.js
│   │   │   ├── CreateServer.js
│   │   │   ├── JoinServer.js
│   │   │   ├── Lobby.js
│   │   │   ├── Loading.js
│   │   │   ├── Game.js
│   │   │   ├── GameOver.js
│   │   │   └── Settings.js
│   │   ├── game/
│   │   │   ├── Renderer.js      ← 5 слоёв, camera, shake
│   │   │   ├── WormRenderer.js  ← Геометрические черви + анимации
│   │   │   ├── InputHandler.js
│   │   │   ├── NetworkClient.js
│   │   │   └── UI.js            ← HUD: HP, таймер, оружия
│   │   └── utils/
│   │       ├── Particles.js     ← Взрывы, осколки, конфетти
│   │       └── SoundManager.js  ← Web Audio API + дистанция
│   └── assets/
│       ├── sounds/              ← 12 WAV файлов
│       └── maps/                ← Фоновые PNG для 6 карт
├── package.json
└── README.md
```

## Game Flow

```
Главное меню
├── [Создать сервер] → форма (ник, порт, макс игроков) → Лобби (хост)
└── [Подключиться]  → форма (IP:порт, ник) → Лобби (клиент)

Лобби
├── Список игроков: Команда A | Команда B
├── Хост: выбор карты, кнопка СТАРТ
├── Кнопка "Скопировать ссылку" (ngrok URL)
└── [СТАРТ] → Loading → Game

Game
├── Turn: A → B → A → B...
├── Внутри команды: по кругу среди живых
├── 30 сек на ход, потом авто-переключение
└── Все черви одной команды мертвы → GameOver

GameOver
├── Анимация победы (конфетти, прыжки)
├── Статистика
└── [Реванш] | [Лобби] | [Главное меню]
```

## Карты (6 штук)

| Карта | Стиль | Особенность |
|---|---|---|
| grassland | Зелёные холмы | Стандартная |
| cave | Подземелье | Туннели |
| island | Тропический | Вода по краям = смерть |
| industrial | Завод | Платформы |
| hell | Лава | Лавовые ямы |
| snowfield | Арктика | Скользкий terrain |

## Оружия (6 штук)

| # | Оружие | Механика | Урон |
|---|---|---|---|
| 1 | Граната | Бросок, таймер 3с, отскакивает | 50 |
| 2 | Базука | Дуга, взрыв при ударе | 60 |
| 3 | Автомат | 8 пуль, разброс, нет взрыва terrain | 12×8 |
| 4 | Авиаудар | 3 бомбы по X | 75 |
| 5 | Святая граната | Таймер 5с, огромный взрыв | 100 |
| 6 | Мина | Ставится, взрывается при наступании | 80 |

## Сетевой протокол

### CLIENT → SERVER
```json
{ "type": "join",        "name": "xXx_Killer" }
{ "type": "swap_team" }
{ "type": "start_game" }
{ "type": "select_map",  "map": "grassland" }
{ "type": "move",        "direction": "left|right" }
{ "type": "jump" }
{ "type": "fire",        "weapon": "grenade", "angle": 45, "power": 0.8 }
{ "type": "airstrike",   "x": 400 }
{ "type": "place_mine" }
{ "type": "end_turn" }
```

### SERVER → CLIENT
```json
{ "type": "joined",       "id": "...", "team": "A", "players": [], "isHost": true }
{ "type": "player_joined","player": {} }
{ "type": "player_left",  "id": "..." }
{ "type": "team_swapped", "id": "...", "newTeam": "B" }
{ "type": "settings",     "map": "grassland" }
{ "type": "loading",      "map": "grassland" }
{ "type": "terrain",      "rle": "..." }
{ "type": "game_start",   "worms": [], "turnQueue": [] }
{ "type": "state",        "worms": [] }
{ "type": "turn_start",   "playerId": "...", "timeLeft": 30 }
{ "type": "projectile",   "id": "...", "weapon": "...", "x": 0, "y": 0, "vx": 0, "vy": 0 }
{ "type": "explosion",    "x": 0, "y": 0, "radius": 60, "damages": [] }
{ "type": "worm_died",    "id": "..." }
{ "type": "turn_end" }
{ "type": "game_over",    "winner": "A", "stats": [] }
```

## Порядок написания кода

- [x] 1.  package.json + config.js + структура папок
- [x] 2.  server/index.js  (сервер + раздача статики + ngrok detect)
- [x] 3.  server/GameRoom.js  (лобби, join, команды, turn queue)
- [x] 4.  client/index.html + main.js  (роутер экранов)
- [x] 5.  screens/MainMenu.js  (меню + Canvas фон)
- [x] 6.  screens/CreateServer.js + JoinServer.js
- [x] 7.  screens/Lobby.js  (полное лобби в реальном времени)
- [x] 8.  server/Terrain.js  (генерация 6 карт + RLE сжатие)
- [x] 9.  screens/Loading.js  (приём terrain, декодирование)
- [x] 10. client/game/Renderer.js  (5 слоёв + camera + shake)
- [x] 11. server/Physics.js  (физика сервера)
- [x] 12. client/game/WormRenderer.js  (геометрические черви + анимации)
- [x] 13. server/Weapons.js  (все оружия)
- [x] 14. client/game/InputHandler.js  (ввод мышь + клавиатура)
- [x] 15. client/game/UI.js  (HUD)
- [x] 16. client/utils/Particles.js  (эффекты взрывов)
- [x] 17. client/utils/SoundManager.js  (звуки с дистанцией)
- [x] 18. screens/GameOver.js  (победа + статистика)
- [x] 19. README.md  (инструкция + ngrok)
