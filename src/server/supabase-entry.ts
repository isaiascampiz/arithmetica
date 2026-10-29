import { handleEdgeRequest } from './edge-handler';

// The build injects edge-environment.ts for process.env reads without mutating Supabase's environment.

declare const Deno: {
  serve: {
    (handler: (request: Request) => Promise<Response>): void;
    (
      options: { hostname: string; port: number },
      handler: (request: Request) => Promise<Response>,
    ): void;
  };
};
if (process.env.ARITHMETICA_LOCAL_PORT)
  Deno.serve(
    { hostname: '127.0.0.1', port: Number(process.env.ARITHMETICA_LOCAL_PORT) },
    handleEdgeRequest,
  );
else Deno.serve(handleEdgeRequest);
