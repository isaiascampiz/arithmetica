import type { Operations } from './v2-model';
import { nextExpected } from './schedule';

/** Saved packet dates stay intact. An older unissued set is queued by the next
 * scheduled return, without turning a schedule into a physical arrival. */
export function preparationReturnDate(
  op: Operations,
  studentId: string,
  setDate: string,
  today: string,
) {
  return setDate < today ? nextExpected(op, studentId, today, true) : setDate;
}
