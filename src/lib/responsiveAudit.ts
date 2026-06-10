/**
 * Responsive audit helper — paste into browser console while testing.
 * Run: responsiveAudit.run() at any viewport size.
 */
export const responsiveAudit = {
  run() {
    const issues: string[] = [];
    const w = window.innerWidth;
    const d = document.documentElement;

    // 1. Horizontal overflow detection
    const scrollW = Math.max(
      d.scrollWidth,
      d.offsetWidth,
      d.clientWidth,
      document.body.scrollWidth,
      document.body.offsetWidth,
    );
    if (scrollW > w + 1) {
      const overflow = scrollW - w;
      issues.push(`HORIZONTAL OVERFLOW: ${overflow}px extra width (scrollW=${scrollW}, viewport=${w})`);
    }

    // 2. Element overflow detection
    document.querySelectorAll('*').forEach((el) => {
      if (el instanceof HTMLElement && el.offsetParent !== null) {
        const rect = el.getBoundingClientRect();
        if (rect.right > w + 1 || rect.left < -1) {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          const cls = el.className && typeof el.className === 'string'
            ? `.${el.className.split(' ').filter(Boolean).slice(0, 2).join('.')}`
            : '';
          if (rect.right > w + 1) {
            issues.push(`  RIGHT OVERFLOW: <${tag}${id}${cls}> extends ${Math.round(rect.right - w)}px past viewport (x=${Math.round(rect.left)}, w=${Math.round(rect.width)})`);
          }
          if (rect.left < -1) {
            issues.push(`  LEFT CLIP: <${tag}${id}${cls}> starts at ${Math.round(rect.left)}px (off-screen left)`);
          }
        }
      }
    });

    // 3. Check for fixed-width elements
    document.querySelectorAll('[style*="width"]').forEach((el) => {
      if (el instanceof HTMLElement) {
        const m = el.style.width.match(/^(\d+)px$/);
        if (m && parseInt(m[1]) > w) {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          issues.push(`  FIXED WIDTH: <${tag}${id}> has width:${m[1]}px which exceeds viewport (${w}px)`);
        }
      }
    });

    // 4. Check for overflowing tables
    document.querySelectorAll('table, [role="table"]').forEach((table) => {
      if (table instanceof HTMLElement && table.scrollWidth > table.clientWidth + 1) {
        issues.push(`  TABLE OVERFLOW: <${table.tagName.toLowerCase()}> scrollW=${table.scrollWidth} > clientW=${table.clientWidth}`);
      }
    });

    // 5. Touch target check (below 768px)
    if (w < 768) {
      document.querySelectorAll('button, a, [role="button"], input, select').forEach((el) => {
        if (el instanceof HTMLElement) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            if (r.width < 44 && r.height < 44) {
              const tag = el.tagName.toLowerCase();
              const text = el.textContent?.trim().slice(0, 30) || '';
              issues.push(`  SMALL TOUCH TARGET: <${tag}> ${Math.round(r.width)}x${Math.round(r.height)}px — "${text}"`);
            }
          }
        }
      });
    }

    // Report
    if (issues.length === 0) {
      console.log(`%c✓ Responsive OK @ ${w}px`, 'color:green;font-weight:bold');
      console.log(`  No overflow, no small touch targets, no fixed-width issues.`);
    } else {
      console.log(`%c✗ Responsive Issues @ ${w}px (${issues.length} total)`, 'color:red;font-weight:bold');
      issues.forEach((msg) => {
        if (msg.startsWith('HORIZONTAL')) {
          console.log(`%c${msg}`, 'color:red;font-weight:bold');
        } else {
          console.log(msg);
        }
      });
    }

    return issues;
  },

  runAllViewports() {
    const viewports = [320, 360, 480, 640, 768, 1024, 1280, 1440, 1920];
    const allIssues: Record<number, string[]> = {};
    const origWidth = window.innerWidth;
    const origHeight = window.innerHeight;

    viewports.forEach((vw) => {
      window.resizeTo(vw, Math.max(origHeight, 700));
      // Re-run after resize settles
      setTimeout(() => {
        const issues = this.run();
        allIssues[vw] = issues;
        if (vw === viewports[viewports.length - 1]) {
          // Restore original size
          window.resizeTo(origWidth, origHeight);
          console.log('%c=== FULL AUDIT SUMMARY ===', 'font-weight:bold');
          Object.entries(allIssues).forEach(([vw, issues]) => {
            if (issues.length > 0) {
              console.log(`%c${vw}px: ${issues.length} issues`, 'color:orange');
              issues.slice(0, 5).forEach((i) => console.log(`  ${i}`));
            } else {
              console.log(`%c${vw}px: ✓ clean`, 'color:green');
            }
          });
        }
      }, 300);
    });
  },
};
