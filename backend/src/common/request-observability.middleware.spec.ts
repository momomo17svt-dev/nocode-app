import { positiveNumber, requestIdFrom } from './request-observability.middleware';

describe('request observability helpers', () => {
  it('accepts a safe caller request id', () => {
    expect(requestIdFrom('req-123.A')).toBe('req-123.A');
  });

  it('replaces unsafe request ids', () => {
    expect(requestIdFrom('bad id\nvalue')).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFrom(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('normalizes positive numeric settings', () => {
    expect(positiveNumber('250', 1000)).toBe(250);
    expect(positiveNumber('-1', 1000)).toBe(1000);
    expect(positiveNumber('invalid', 1000)).toBe(1000);
  });
});
