import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

/**
 * Sombras y velos: no son color de marca ni de tema, son negro puro con
 * opacidad y valen igual en claro y en oscuro.
 */
const ALLOWED = [/shadowColor:\s*'#000'/, /rgba\(0,\s*0,\s*0,/];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    const isSource = /\.tsx?$/.test(entry) && !entry.includes('.test.');
    return isSource ? [full] : [];
  });

describe('the palette is the only source of color', () => {
  it('leaves no literal color outside src/theme', () => {
    // El tema oscuro llego con un '#FDF2F2' suelto en DayStatusCard: el fondo
    // se quedo claro mientras el texto encima se volvia casi blanco, y la fila
    // de "falta el comprobante" quedo ilegible. Un color que el tema no ve es
    // un color que no puede cambiar con el tema.
    const offenders = walk(SRC)
      .filter((file) => !file.includes(`${join('src', 'theme')}`) && !file.includes('/theme/'))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ file, line, number: index + 1 }))
          .filter(({ line }) => /#[0-9A-Fa-f]{3,8}'/.test(line) || /rgba?\(/.test(line))
          .filter(({ line }) => !ALLOWED.some((allowed) => allowed.test(line)))
          .map(({ file, line, number }) => `${file.replace(SRC, 'src')}:${number} ${line.trim()}`),
      );

    expect(offenders).toEqual([]);
  });
});
