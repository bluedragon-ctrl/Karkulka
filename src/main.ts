import './style.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (root) (window as unknown as { app: App }).app = new App(root);
