/**
 * Tests for the CSV export: safe fields (no spreadsheet formulas), the points list with O
 * first, the steps of an addition, and the double-and-add table.
 */
import { describe, expect, it } from 'vitest';
import { addWithSteps, createCurve, listPoints, multiplyWithSteps } from '@shared/ecc/index.ts';
import {
  additionCsv,
  csvField,
  fileStem,
  multiplyCsv,
  pointsCsv,
} from '../../client/src/features/export/csv.ts';
import type { PointList } from '../../client/src/features/points/usePointListing.ts';

const E23 = createCurve(23n, 1n, 1n);

describe('csv fields', () => {
  it('quotes commas and quotes, and keeps plain numbers as they are', () => {
    expect(csvField('(3, 10)')).toBe('"(3, 10)"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(-164n)).toBe('-164');
    expect(csvField(42)).toBe('42');
  });

  it('stops text from being run as a spreadsheet formula', () => {
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('+cmd')).toBe("'+cmd");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('-x')).toBe("'-x");
  });
});

describe('csv files', () => {
  it('lists every point with O first', () => {
    const points = listPoints(E23);
    const list: PointList = {
      curve: E23,
      xs: Uint32Array.from(points.map((point) => Number(point.x))),
      ys: Uint32Array.from(points.map((point) => Number(point.y))),
      count: points.length,
      elapsedMs: 1,
    };
    const lines = pointsCsv(list).trimEnd().split('\r\n');
    expect(lines[0]).toBe('number,x,y,note');
    expect(lines[1]).toBe('1,,,point at infinity O');
    expect(lines[2]).toBe('2,0,1,');
    expect(lines).toHaveLength(29);
  });

  it('writes the steps of an addition', () => {
    const text = additionCsv(E23, addWithSteps(E23, { x: 3n, y: 10n }, { x: 9n, y: 7n }));
    expect(text).toContain('lambda,11\r\n');
    expect(text).toContain('inverse of denominator,4\r\n');
    expect(text).toContain('result,"(17, 20)"\r\n');
  });

  it('writes the double-and-add table', () => {
    const E17 = createCurve(17n, 2n, 2n);
    const lines = multiplyCsv(multiplyWithSteps(E17, 13n, { x: 5n, y: 1n }))
      .trimEnd()
      .split('\r\n');
    expect(lines[0]).toBe('step,bit,operation,R equals,x of R,y of R');
    expect(lines[1]).toBe('1,1,start,1P,5,1');
    expect(lines[4]).toBe('4,1,double-add,13P,16,4');
    expect(lines[5]).toBe('result,,k = 13,kP,16,4');
  });

  it('names files after the curve, without huge numbers', () => {
    expect(fileStem(E23)).toBe('E23-1-1');
    expect(fileStem(createCurve(2n ** 255n - 19n, 3n, 5n))).toBe('curve-255bit');
  });
});
