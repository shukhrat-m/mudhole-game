import MainMenu     from './screens/MainMenu.js';
import CreateServer  from './screens/CreateServer.js';
import JoinServer    from './screens/JoinServer.js';
import Lobby         from './screens/Lobby.js';
import Loading       from './screens/Loading.js';
import GameScreen    from './screens/Game.js';
import GameOver      from './screens/GameOver.js';
import Settings      from './screens/Settings.js';
import NetworkClient from './game/NetworkClient.js';

// ─── Resize canvas ──────────────────────────────────────────────────────────
const canvasIds = ['canvas-bg', 'canvas-terrain', 'canvas-game', 'canvas-effects', 'canvas-ui-game'];
function resizeCanvases() {
  canvasIds.forEach(id => {
    const c = document.getElementById(id);
    c.width  = window.innerWidth;
    c.height = window.innerHeight;
  });
}
resizeCanvases();
window.addEventListener('resize', resizeCanvases);

// ─── Screen router ──────────────────────────────────────────────────────────
const ui = document.getElementById('ui');
let currentScreen = null;

const screenMap = {
  mainMenu:     MainMenu,
  createServer: CreateServer,
  joinServer:   JoinServer,
  lobby:        Lobby,
  loading:      Loading,
  game:         GameScreen,
  gameOver:     GameOver,
  settings:     Settings,
};

export function showScreen(name, data = {}) {
  if (currentScreen) currentScreen.destroy();
  ui.innerHTML = '';
  const ScreenClass = screenMap[name];
  if (!ScreenClass) { console.error('Unknown screen:', name); return; }
  currentScreen = new ScreenClass(data);
  currentScreen.init(ui);
}

// ─── Глобальный сетевой клиент ──────────────────────────────────────────────
export const net = new NetworkClient();

// ─── Старт ──────────────────────────────────────────────────────────────────
showScreen('mainMenu');
