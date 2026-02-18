import { el } from '../util/dom.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createFloatingWindow({ parent, title, state, minWidth = 420, minHeight = 300, onStateChange, onClose }) {
  const root = el('section', 'floating-window');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', title);

  const titleBar = el('header', 'floating-window__titlebar');
  const titleText = el('strong', 'floating-window__title', title);
  const closeBtn = el('button', 'floating-window__close', '×');
  closeBtn.type = 'button';
  closeBtn.title = 'Close';
  titleBar.append(titleText, closeBtn);

  const body = el('div', 'floating-window__body');
  const resize = el('div', 'floating-window__resize-handle');
  resize.title = 'Resize';

  root.append(titleBar, body, resize);
  parent.append(root);

  function applyRect(rect) {
    const maxX = Math.max(0, window.innerWidth - rect.w);
    const maxY = Math.max(0, window.innerHeight - rect.h);
    const x = clamp(rect.x, 0, maxX);
    const y = clamp(rect.y, 0, maxY);
    const w = clamp(rect.w, minWidth, window.innerWidth - 20);
    const h = clamp(rect.h, minHeight, window.innerHeight - 20);
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    root.style.width = `${w}px`;
    root.style.height = `${h}px`;
    return { x, y, w, h, open: true, z: rect.z ?? 10 };
  }

  let currentRect = applyRect(state);

  function updateRect(nextRect) {
    currentRect = applyRect(nextRect);
    onStateChange?.(currentRect);
  }

  function consumePointer(e) {
    e.stopPropagation();
  }

  ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel'].forEach((eventName) => {
    root.addEventListener(eventName, consumePointer);
  });

  function beginDrag(e, kind) {
    e.preventDefault();
    e.stopPropagation();
    const origin = {
      x: e.clientX,
      y: e.clientY,
      rect: { ...currentRect }
    };

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - origin.x;
      const dy = moveEvent.clientY - origin.y;
      if (kind === 'move') {
        updateRect({ ...currentRect, x: origin.rect.x + dx, y: origin.rect.y + dy });
      } else {
        updateRect({
          ...currentRect,
          w: origin.rect.w + dx,
          h: origin.rect.h + dy
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  titleBar.addEventListener('pointerdown', (e) => beginDrag(e, 'move'));
  resize.addEventListener('pointerdown', (e) => beginDrag(e, 'resize'));

  closeBtn.onclick = () => {
    onClose?.();
  };

  window.addEventListener('resize', () => {
    updateRect(currentRect);
  });

  return {
    body,
    root,
    setState(nextState) {
      currentRect = applyRect(nextState);
      root.style.display = nextState.open ? 'grid' : 'none';
      root.style.zIndex = String(nextState.z ?? 10);
    }
  };
}
