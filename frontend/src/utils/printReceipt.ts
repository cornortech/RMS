// THERMAL PRINT HELPER (80mm printers)
// Prints ONLY the receipt, on paper exactly as long as the receipt, once.

const PAPER_WIDTH_MM = 80;
const PX_PER_MM = 96 / 25.4;

// Print an element that is already on the screen, e.g. printReceipt('printable-bill')
export function printReceipt(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) {
    console.error(`printReceipt: #${elementId} not found`);
    return;
  }
  printHtml(el.outerHTML, { copyAppStyles: true });
}

// Print a ready-made piece of HTML (with its own CSS in extraCss)
export function printHtml(bodyHtml: string, options: { copyAppStyles?: boolean; extraCss?: string } = {}) {
  const iframe = document.createElement('iframe');
  // Real size but off-screen. A 0x0 or hidden frame prints BLANK in some browsers.
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${PAPER_WIDTH_MM}mm`,
    height: '400mm',
    border: '0',
  });
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }

  // Copy the app's CSS so the receipt looks the same as on screen.
  // The receipt's own "@media print" rules are switched on here, so we measure it as it will print.
  let appStyles = '';
  if (options.copyAppStyles) {
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      if (node.tagName === 'LINK') {
        appStyles += `<link rel="stylesheet" href="${(node as HTMLLinkElement).href}">`;
      } else {
        appStyles += `<style>${(node.textContent || '').replace(/@media\s+print/g, '@media all')}</style>`;
      }
    });
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${appStyles}
<style>
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; width: ${PAPER_WIDTH_MM}mm !important; }
  /* Everything is inside .print-root: 72mm wide, starting at the LEFT edge of the roll */
.print-root { width: 80mm; padding: 0 4mm; box-sizing: border-box; }
  .print-root > * {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 0 !important;
    box-shadow: none !important;
    border: none !important;
    transform: none !important;
  }
  .print-root, .print-root * { visibility: visible !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-root, .print-root * { color: #000 !important; }
  ${options.extraCss || ''}
</style>
</head>
<body><div class="print-root">${bodyHtml}</div></body>
</html>`);
  doc.close();

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    // Removing the frame too early can cancel the print job
    window.setTimeout(() => iframe.remove(), 3000);
  };

  const whenReady = async () => {
    // Wait for CSS, fonts and images (e.g. the payment QR) before measuring
    if (doc.readyState !== 'complete') {
      await new Promise<void>((resolve) => {
        win.addEventListener('load', () => resolve(), { once: true });
        window.setTimeout(resolve, 3000);
      });
    }
    if (doc.fonts?.ready) await doc.fonts.ready;
    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })
      )
    );
  };

  const run = async () => {
    try {
      await whenReady();

           // No page height: the printer's own 80mm roll decides the length,
      // so Windows doesn't center a small page in the middle of its paper.
      const page = doc.createElement('style');
      page.textContent = '@page { margin: 0; }';
      doc.head.appendChild(page);

      win.onafterprint = cleanup;
      win.focus();
      win.print();
    } catch (err) {
      console.error('Print failed:', err);
    }
    window.setTimeout(cleanup, 60000);
  };

  window.setTimeout(run, 100);
}