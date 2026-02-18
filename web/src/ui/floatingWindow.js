import { el } from '../util/dom.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stopMapInteraction(event) {
  event.stopPropagation();
}

export function createFloatingWindow(root, config) {
  const node = el('section', 'floating-window');
  node.style.zIndex = String(config.zIndex ?? 30);
  const titlebar = el('div', 'floating-window__titlebar');
  const title = el('strong', 'floating-window__title', config.title ?? 'Window');
  const controls = el('div', 'floating-window__controls');
  const close = el('button', 'floating-window__close', '✕');
  close.type = 'button';
  controls.append(close);
  titlebar.append(title, controls);

  const content = el('div', 'floating-window__content');
  const resize = el('div', 'floating-window__resize');
  node.append(titlebar, content, resize);
  root.append(node);

  const minWidth = config.minWidth ?? 460;
  const minHeight = config.minHeight ?? 320;
  const maxWidthPad = 20;
  const maxHeightPad = 20;

  let dragState = null;
  let resizeState = null;

  function applyBounds(nextState) {
    const maxWidth = Math.max(minWidth, window.innerWidth - maxWidthPad);
    const maxHeight = Math.max(minHeight, window.innerHeight - maxHeightPad);
    const width = clamp(nextState.w, minWidth, maxWidth);
    const height = clamp(nextState.h, minHeight, maxHeight);
    const x = clamp(nextState.x, 0, Math.max(0, window.innerWidth - width));
    const y = clamp(nextState.y, 44, Math.max(44, window.innerHeight - height));
    config.onChange?.({ ...nextState, x, y, w: width, h: height });
  }

  function render(state) {
    node.hidden = !state.open;
    if (!state.open) return;
    node.style.left = `${state.x}px`;
    node.style.top = `${state.y}px`;
    node.style.width = `${state.w}px`;
    node.style.height = `${state.h}px`;
    node.style.zIndex = String(state.zIndex ?? config.zIndex ?? 30);
  }

  function beginDrag(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    config.onFocus?.();
    const state = config.getState();
    dragState = { x: event.clientX, y: event.clientY, startX: state.x, startY: state.y };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', endDrag);
  }

  function onDragMove(event) {
    if (!dragState) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    applyBounds({ ...config.getState(), x: dragState.startX + dx, y: dragState.startY + dy });
  }

  function endDrag() {
    dragState = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', endDrag);
  }

  function beginResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    config.onFocus?.();
    const state = config.getState();
    resizeState = { x: event.clientX, y: event.clientY, w: state.w, h: state.h };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', endResize);
  }

  function onResizeMove(event) {
    if (!resizeState) return;
    const dx = event.clientX - resizeState.x;
    const dy = event.clientY - resizeState.y;
    applyBounds({ ...config.getState(), w: resizeState.w + dx, h: resizeState.h + dy });
  }

  function endResize() {
    resizeState = null;
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', endResize);
  }

  titlebar.addEventListener('mousedown', beginDrag);
  resize.addEventListener('mousedown', beginResize);
  close.addEventListener('click', () => config.onClose?.());

  [node, titlebar, content, resize].forEach((target) => {
    target.addEventListener('mousedown', stopMapInteraction);
    target.addEventListener('wheel', stopMapInteraction);
    target.addEventListener('click', () => config.onFocus?.());
  });

  window.addEventListener('resize', () => applyBounds(config.getState()));

  return { node, content, render, setTitle: (text) => { title.textContent = text; } };
}
