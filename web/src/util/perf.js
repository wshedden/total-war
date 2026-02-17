export function createFpsCounter() {
  let last = performance.now();
  let frames = 0;
  let fps = 0;
  return {
    tick() {
      frames += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        fps = frames;
        frames = 0;
        last = now;
      }
      return fps;
    }
  };
}
