// ============================================================================
//  Rellenos (polyfills) que pdfjs-dist necesita para correr en Node.
//
//  pdfjs trae sus propios rellenos, pero solo se activan cuando detecta Node
//  al cargarse. En producción el módulo se carga como "external module" desde
//  el empaquetado de Next y esa detección no se aplica, así que falla con
//  "ReferenceError: DOMMatrix is not defined" (en local sí funciona: de ahí
//  que las pruebas pasaran y la web no).
//
//  Solo se usa `getTextContent()`, que no dibuja nada: estas clases existen
//  para que el módulo pueda cargarse. DOMMatrix está implementada de verdad
//  (transformaciones 2D); Path2D e ImageData son mínimas porque solo hacen
//  falta al rasterizar páginas, cosa que aquí nunca ocurre.
// ============================================================================

// Se accede a `globalThis` sin los tipos del DOM: aquí se define lo que falta,
// no se implementan las interfaces completas del navegador.
type G = Record<string, unknown>;

class DOMMatrixPolyfill {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;

  constructor(init?: number[] | string) {
    if (Array.isArray(init)) {
      if (init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      } else if (init.length === 16) {
        // Matriz 4x4: se conserva su parte 2D.
        this.a = init[0]; this.b = init[1];
        this.c = init[4]; this.d = init[5];
        this.e = init[12]; this.f = init[13];
      }
    }
  }

  // Alias 3D de la submatriz 2D (pdfjs usa ambas notaciones).
  get m11() { return this.a; }
  get m12() { return this.b; }
  get m21() { return this.c; }
  get m22() { return this.d; }
  get m41() { return this.e; }
  get m42() { return this.f; }

  private static from(a: number, b: number, c: number, d: number, e: number, f: number) {
    return new DOMMatrixPolyfill([a, b, c, d, e, f]);
  }

  multiply(o: DOMMatrixPolyfill): DOMMatrixPolyfill {
    return DOMMatrixPolyfill.from(
      this.a * o.a + this.c * o.b,
      this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d,
      this.b * o.c + this.d * o.d,
      this.a * o.e + this.c * o.f + this.e,
      this.b * o.e + this.d * o.f + this.f,
    );
  }

  multiplySelf(o: DOMMatrixPolyfill): this {
    return this.copyFrom(this.multiply(o));
  }

  translate(tx = 0, ty = 0): DOMMatrixPolyfill {
    return this.multiply(DOMMatrixPolyfill.from(1, 0, 0, 1, tx, ty));
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.copyFrom(this.translate(tx, ty));
  }

  scale(sx = 1, sy = sx): DOMMatrixPolyfill {
    return this.multiply(DOMMatrixPolyfill.from(sx, 0, 0, sy, 0, 0));
  }

  scaleSelf(sx = 1, sy = sx): this {
    return this.copyFrom(this.scale(sx, sy));
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (!det) {
      this.a = this.b = this.c = this.d = this.e = this.f = NaN;
      return this;
    }
    return this.copyFrom(
      DOMMatrixPolyfill.from(
        this.d / det,
        -this.b / det,
        -this.c / det,
        this.a / det,
        (this.c * this.f - this.d * this.e) / det,
        (this.b * this.e - this.a * this.f) / det,
      ),
    );
  }

  transformPoint(p: { x?: number; y?: number } = {}) {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: 0,
      w: 1,
    };
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }

  private copyFrom(m: DOMMatrixPolyfill): this {
    this.a = m.a; this.b = m.b; this.c = m.c;
    this.d = m.d; this.e = m.e; this.f = m.f;
    return this;
  }
}

class Path2DPolyfill {
  addPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  arc(): void {}
  arcTo(): void {}
  ellipse(): void {}
  rect(): void {}
}

class ImageDataPolyfill {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
    if (typeof a === "number") {
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    } else {
      this.data = a;
      this.width = b;
      this.height = c ?? (b ? a.length / 4 / b : 0);
    }
  }
}

/** Define en `globalThis` lo que falte. Es idempotente y no pisa nada nativo. */
export function installPdfNodePolyfills(): void {
  const g = globalThis as unknown as G;

  if (typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers !== "function") {
    (Promise as unknown as { withResolvers: unknown }).withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = DOMMatrixPolyfill;
  if (typeof g.Path2D === "undefined") g.Path2D = Path2DPolyfill;
  if (typeof g.ImageData === "undefined") g.ImageData = ImageDataPolyfill;
}
