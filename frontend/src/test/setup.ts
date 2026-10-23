import '@testing-library/jest-dom';

// ResizeObserver stub for React Flow
if (typeof global.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// DOMMatrix / DOMMatrixReadOnly stub for React Flow
if (typeof global.DOMMatrixReadOnly === 'undefined') {
  class DOMMatrixReadOnlyStub {
    m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true;
    isIdentity = true;
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
    translate() { return this; }
    scale() { return this; }
    multiply() { return this; }
    inverse() { return this; }
  }
  global.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;
  window.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;
}

if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = global.DOMMatrixReadOnly as unknown as typeof DOMMatrix;
  window.DOMMatrix = window.DOMMatrixReadOnly as unknown as typeof DOMMatrix;
}

// Element sizes / getBoundingClientRect / clientWidth/clientHeight stubs for React Flow
if (typeof window !== 'undefined' && window.HTMLElement) {
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: {
      get() { return parseFloat(this.style.width) || 800; },
      configurable: true,
    },
    clientHeight: {
      get() { return parseFloat(this.style.height) || 600; },
      configurable: true,
    },
    offsetWidth: {
      get() { return parseFloat(this.style.width) || 800; },
      configurable: true,
    },
    offsetHeight: {
      get() { return parseFloat(this.style.height) || 600; },
      configurable: true,
    },
  });

  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const width = parseFloat(this.style.width) || (this.classList.contains('react-flow') ? 800 : 150);
    const height = parseFloat(this.style.height) || (this.classList.contains('react-flow') ? 600 : 60);
    return {
      width,
      height,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      x: 0,
      y: 0,
      toJSON() { return this; },
    };
  };
}
