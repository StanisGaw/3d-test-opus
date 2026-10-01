import './style.css';
import { Game } from './game/Game.ts';

const container = document.getElementById('game');
const hud = document.getElementById('hud');
if (!container || !hud) throw new Error('Missing #game or #hud root element');

(window as unknown as { __game: Game }).__game = new Game(container, hud);
