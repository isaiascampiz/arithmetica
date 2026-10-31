import { nameCompletionResponse } from '@/lib/name-completion-route';
export async function POST(req: Request) {
  return nameCompletionResponse(req, true);
}
