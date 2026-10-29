import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { DomainError } from './domain';
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function failure(error: unknown) {
  if (error instanceof SyntaxError) return json({ error: 'Invalid JSON request.' }, 400);
  if (error instanceof DomainError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json({ error: error.issues[0]?.message || 'Invalid input.' }, 400);
  console.error('Arithmetica request failed', error instanceof Error ? error.message : 'unknown');
  return json(
    { error: 'Unable to save. Check the server and retry; no success has been recorded.' },
    500,
  );
}
