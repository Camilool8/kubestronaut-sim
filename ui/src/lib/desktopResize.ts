type Resizable = { resizeSession: boolean };

class DesktopResize {
  private rfb: Resizable | null = null;
  private held = 0;

  attach(rfb: Resizable): void {
    this.rfb = rfb;

    rfb.resizeSession = this.held === 0;
  }

  detach(rfb: Resizable): void {
    if (this.rfb === rfb) this.rfb = null;
  }

  hold(): void {
    this.held += 1;
    if (this.rfb) this.rfb.resizeSession = false;
  }

  release(): void {
    this.held = Math.max(0, this.held - 1);

    if (this.held === 0 && this.rfb) this.rfb.resizeSession = true;
  }

  reset(): void {
    this.rfb = null;
    this.held = 0;
  }
}

export const desktopResize = new DesktopResize();
