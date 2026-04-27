// Tiny arrow-key picker with audition-on-change. Used by the wizard for
// intro chimes and voice samples - press <- / -> to cycle, Enter to pick,
// 's' to skip, q/Esc to cancel. Each move calls `onChange(item)` so the
// caller can play that item's audio.
import { stdin, stdout } from 'node:process';

/**
 * Render an arrow-key picker. Returns a Promise resolving to:
 *   { value: <chosen item.value>, index: <index> } on Enter
 *   { skipped: true } if user presses 's'
 *   { cancelled: true } if user presses q or Esc
 *
 * @param {object} opts
 * @param {Array<{label: string, value: any}>} opts.items
 * @param {string} opts.title - shown above the list
 * @param {(item, index) => void} [opts.onChange] - fires when index changes
 * @param {boolean} [opts.allowSkip=true] - 's' returns {skipped: true}
 */
export function arrowPick({ items, title, onChange, allowSkip = true }) {
  return new Promise((resolve) => {
    if (!items || items.length === 0) {
      resolve({ skipped: true });
      return;
    }

    let idx = 0;

    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    function render() {
      const help = allowSkip
        ? '   [<- ->] cycle   [Enter] pick   [s] skip   [q] cancel'
        : '   [<- ->] cycle   [Enter] pick   [q] cancel';
      stdout.write('[2J[0;0H'); // clear screen + home
      stdout.write(title + '\n\n');
      items.forEach((it, i) => {
        const marker = i === idx ? '>' : ' ';
        stdout.write(`  ${marker} ${i + 1}. ${it.label}\n`);
      });
      stdout.write('\n' + help + '\n');
    }

    function cleanup() {
      stdin.removeListener('data', onKey);
      stdin.setRawMode(wasRaw || false);
      stdin.pause();
      stdout.write('\n');
    }

    function move(delta) {
      idx = (idx + delta + items.length) % items.length;
      render();
      if (onChange) onChange(items[idx], idx);
    }

    function onKey(buf) {
      const key = buf.toString();

      // Esc sequences for arrows.
      if (key === '[C' || key === '[B') return move(+1); // right or down
      if (key === '[D' || key === '[A') return move(-1); // left or up
      if (key === ' ' || key === 'l' || key === 'L') return move(+1);
      if (key === 'h' || key === 'H') return move(-1);
      if (key === 'j' || key === 'J') return move(+1);
      if (key === 'k' || key === 'K') return move(-1);
      if (key === '\r' || key === '\n') {
        cleanup();
        return resolve({ value: items[idx].value, index: idx });
      }
      if (allowSkip && (key === 's' || key === 'S')) {
        cleanup();
        return resolve({ skipped: true });
      }
      if (key === 'q' || key === 'Q' || key === '' || key === '') {
        cleanup();
        return resolve({ cancelled: true });
      }
      // Number keys 1-9 jump directly.
      const n = parseInt(key, 10);
      if (Number.isFinite(n) && n >= 1 && n <= items.length) {
        idx = n - 1;
        render();
        if (onChange) onChange(items[idx], idx);
      }
    }

    render();
    if (onChange) onChange(items[idx], idx);
    stdin.on('data', onKey);
  });
}
